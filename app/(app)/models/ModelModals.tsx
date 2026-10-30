"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ConfirmModal, Modal, QuestionModal, useUnsavedGuard } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { FormTabs } from "@/components/ui/TablePart";
import { YamlEditor } from "@/components/ui/YamlEditor";
import { ModelPicker } from "@/components/ui/ModelPicker";
import { SecretInput } from "@/components/ui/SecretInput";
import { modelToYaml, yamlToModel } from "@/lib/model-spec";
import { checkSavedModel, deleteModel, listModelsFor, saveModel, type ListState, type ModelField } from "./actions";

/** What the browser knows about a model — never the token itself. `usedBy` — who works on it (it can't be deleted then). */
export type ModelRowData = {
  id: string; name: string; description: string; baseUrl: string; model: string; hasToken: boolean; contextTokens: number; usedBy: string[];
};

/** What the model window edits besides the token (the token is never shown or put into YAML). */
type Fields = { name: string; description: string; baseUrl: string; model: string; contextTokens: string };
type Tab = "general" | "params" | "yaml";
const TAB_OF: Record<ModelField, Tab> = { name: "general", baseUrl: "params", token: "params", model: "params", contextTokens: "params" };
const INPUT_OF: Record<ModelField, string> = { name: "md-name", baseUrl: "md-url", token: "md-token", model: "md-model", contextTokens: "md-ctx" };
const URL_RE = /^https?:\/\/\S+$/i;

/**
 * The model window: «Общее · Параметры · YAML» and «Сохранить».
 * «Проверить» asks the server for its models; «Сохранить» checks fields top to bottom and shows only the first problem.
 * Editing: «Сохранить» stays grey until something changes; × / Esc with changes ask first (Modal).
 */
function ModelForm({ m, onDone }: { m?: ModelRowData; onDone: () => void }) {
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useFormAction(saveModel, undefined);
  useEffect(() => { if (state?.ok) { toast(state.ok); onDone(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const [initial] = useState<Fields>(() => ({
    name: m?.name ?? "", description: m?.description ?? "", baseUrl: m?.baseUrl ?? "", model: m?.model ?? "",
    contextTokens: String(m?.contextTokens ?? 32000),
  }));
  const [f, setF] = useState<Fields>(initial);
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<Tab>("general");
  const [err, setErr] = useState<{ field: ModelField; text: string }>();

  // ---- «Проверить»: the server's model list ----
  const [list, setList] = useState<ListState | "checking">();
  const [models, setModels] = useState<string[]>([]);
  const [, startCheck] = useTransition();
  const checked = list !== undefined && list !== "checking" && (list.kind === "ok" || list.kind === "nolist");
  const modelOpen = !!m || checked; // a new model is typed or picked only after a successful check
  function check() {
    setList("checking");
    startCheck(async () => {
      const r = await listModelsFor(new FormData(form.current!));
      setList(r); setModels(r.models);
    });
  }

  const upd = (patch: Partial<Fields>, field?: ModelField) => {
    setF((p) => ({ ...p, ...patch }));
    if (field && err?.field === field) setErr(undefined);
    // another address or token: the old list says nothing about it
    if ("baseUrl" in patch) { setList(undefined); setModels([]); }
  };

  const dirty = JSON.stringify(f) !== JSON.stringify(initial) || token !== "";
  useUnsavedGuard(dirty);

  // a field error from the server goes under its field, like the ones found here
  useEffect(() => { if (state?.error && state.field) show(state.field, state.error); }, [state]);
  function show(field: ModelField, text: string) {
    setErr({ field, text });
    setTab(TAB_OF[field]);
    requestAnimationFrame(() => document.getElementById(INPUT_OF[field])?.focus());
  }

  // top to bottom, the first problem only
  function problem(): [ModelField, string] | null {
    if (!f.name.trim()) return ["name", "Укажите название"];
    if (!f.baseUrl.trim()) return ["baseUrl", "Укажите адрес API"];
    if (!URL_RE.test(f.baseUrl.trim())) return ["baseUrl", "Адрес должен начинаться с http:// или https://"];
    if (!token.trim() && !m?.hasToken) return ["token", "Укажите токен"];
    if (!modelOpen) return ["model", "Сначала проверьте подключение"];
    if (!f.model.trim()) return ["model", models.length ? "Выберите модель" : "Укажите модель"];
    if (!f.contextTokens.trim()) return ["contextTokens", "Укажите размер контекста"];
    return null;
  }
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const p = problem();
    if (p) { e.preventDefault(); show(p[0], p[1]); return; }
    submit(e);
  }

  // ---- YAML: generated when the tab opens; every edit there fills the other tabs ----
  const toSpec = (v: Fields) => ({ name: v.name, description: v.description, baseUrl: v.baseUrl, model: v.model, contextTokens: Number(v.contextTokens) || 32000 });
  const [yaml, setYaml] = useState("");
  const [yamlNote, setYamlNote] = useState<{ error?: string; warnings: string[] }>({ warnings: [] });
  const [askUpload, setAskUpload] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  function openTab(k: Tab) {
    if (k === "yaml") { setYaml(modelToYaml(toSpec(f))); setYamlNote({ warnings: [] }); }
    setTab(k);
  }
  function applyYaml(text: string) {
    setYaml(text);
    const r = yamlToModel(text);
    if ("error" in r) { setYamlNote({ error: r.error, warnings: [] }); return; }
    const s = r.spec;
    upd({ name: s.name, description: s.description, baseUrl: s.baseUrl, model: s.model, contextTokens: String(s.contextTokens) });
    setErr(undefined);
    setYamlNote({ warnings: r.warnings });
  }
  function download() {
    const text = tab === "yaml" ? yaml : modelToYaml(toSpec(f));
    const url = URL.createObjectURL(new Blob([text], { type: "application/yaml;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(f.name.trim() || f.model.trim() || "модель").replace(/[\\/:*?"<>|]+/g, "_")}.yaml`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) applyYaml(await file.text());
  }

  const fieldErr = (field: ModelField) => err?.field === field ? <div className="ferr" role="alert">{err.text}</div> : null;
  const bad = (field: ModelField) => (err?.field === field ? "bad" : undefined);
  const listCls = list === "checking" ? "checking" : list?.kind === "ok" ? "ok" : list?.kind === "nolist" ? "warn" : "err";
  const generalError = state?.error && !state.field ? state.error : undefined;

  return (
    <form ref={form} onSubmit={onSubmit} noValidate autoComplete="off">
      {m && <input type="hidden" name="id" value={m.id} />}
      <input type="hidden" name="listed" value={models.includes(f.model.trim()) ? "1" : ""} />
      <input type="hidden" name="model" value={f.model} />
      <FormTabs active={tab} onChange={openTab} tabs={[{ key: "general", label: "Общее" }, { key: "params", label: "Параметры" }, { key: "yaml", label: "YAML" }]} />

      <div className="apanel fill" hidden={tab !== "general"}>
        <div className="field">
          <label htmlFor="md-name">Название <span className="req">*</span></label>
          <input id="md-name" name="name" autoComplete="off" className={bad("name")} value={f.name} onChange={(e) => upd({ name: e.target.value }, "name")} placeholder="например, Ollama Cloud" maxLength={80} />
          {fieldErr("name")}
        </div>
        <div className="field grow half">
          <label htmlFor="md-desc">Описание</label>
          <textarea id="md-desc" name="description" value={f.description} onChange={(e) => upd({ description: e.target.value })} placeholder="Для чего эта модель" maxLength={300} />
        </div>
      </div>

      <div className="apanel" hidden={tab !== "params"}>
        <div className="field">
          <label htmlFor="md-url">Адрес API <span className="req">*</span></label>
          <input id="md-url" name="baseUrl" autoComplete="off" className={bad("baseUrl")} value={f.baseUrl} onChange={(e) => upd({ baseUrl: e.target.value }, "baseUrl")} placeholder="например, https://ollama.com/v1" />
          {fieldErr("baseUrl")}
        </div>
        <div className="field">
          <label htmlFor="md-token">Токен <span className="req">*</span></label>
          <SecretInput id="md-token" name="token" className={bad("token")} value={token}
            onChange={(e) => { setToken(e.target.value); setList(undefined); setModels([]); if (err?.field === "token") setErr(undefined); }}
            placeholder={m?.hasToken ? "Токен сохранён" : undefined} />
          {fieldErr("token")}
        </div>
        <div className="checkrow">
          <button type="button" className="btn ghost" onClick={check} disabled={list === "checking"}>Проверить</button>
          {list && (
            <span className={`status ${listCls}`} role="status">
              {list === "checking" ? <><span className="spin" /> Проверяем подключение…</> : list.message}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="md-model">Модель <span className="req">*</span></label>
          <ModelPicker id="md-model" value={f.model} options={models} disabled={!modelOpen} invalid={err?.field === "model"}
            onChange={(model) => upd({ model }, "model")}
            placeholder={!modelOpen ? "Нет подключения" : models.length ? "Выберите модель" : "например, llama3.1:8b"} />
          {fieldErr("model")}
        </div>
        <div className="field">
          <label htmlFor="md-ctx">Контекст, токенов <span className="req">*</span></label>
          <input id="md-ctx" name="contextTokens" type="number" autoComplete="off" className={bad("contextTokens")} min={2000} max={2000000} step={1000}
            value={f.contextTokens} onChange={(e) => upd({ contextTokens: e.target.value }, "contextTokens")} />
          {fieldErr("contextTokens")}
        </div>
      </div>

      <div className="apanel yamlpanel" hidden={tab !== "yaml"}>
        <YamlEditor label="YAML модели" value={yaml} onChange={applyYaml} />
        {yamlNote.error && <div className="formerr">{yamlNote.error}</div>}
        {yamlNote.warnings.length > 0 && (
          <div className="callout warn yaml-warn"><div>{yamlNote.warnings.map((w) => <div key={w}>{w}</div>)}</div></div>
        )}
        <div className="wrap-gap" style={{ marginTop: 12 }}>
          <button type="button" className="btn ghost" onClick={download}>Скачать</button>
          <button type="button" className="btn ghost" onClick={() => setAskUpload(true)}>Загрузить</button>
          <input ref={fileInput} type="file" accept=".yaml,.yml,text/yaml" hidden onChange={upload} />
        </div>
      </div>

      {generalError && <div className="formerr">{generalError}</div>}
      <div className="mfoot">
        <span className="spacer" />
        <button className="btn primary" type="submit" disabled={pending || (!!m && !dirty)}>{pending ? "Сохраняем…" : "Сохранить"}</button>
      </div>
      <QuestionModal open={askUpload} title="Загрузить YAML?" text="Текущие настройки будут заменены данными из файла."
        confirmLabel="Заменить" onCancel={() => setAskUpload(false)}
        onConfirm={() => { setAskUpload(false); fileInput.current?.click(); }} />
    </form>
  );
}

export function AddModelButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary spacer" onClick={() => setOpen(true)}>Добавить</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Новая модель" editor compact>
        {open && <ModelForm onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

export function ModelActions({ m }: { m: ModelRowData }) {
  const toast = useToast();
  const [modal, setModal] = useState<"edit" | "del" | null>(null);
  const [delError, setDelError] = useState<string>();
  const [checking, startCheck] = useTransition();
  const [deleting, startDel] = useTransition();
  const close = () => { setModal(null); setDelError(undefined); };

  return (
    <>
      <IconButton icon="check" title={checking ? "Проверяем…" : "Проверить"} disabled={checking}
        onClick={() => startCheck(async () => { const r = await checkSavedModel(m.id); if (r) toast(r.message); })} />
      <IconButton icon="edit" title="Изменить" data-row-open onClick={() => setModal("edit")} />
      <IconButton icon="del" title="Удалить" onClick={() => setModal("del")} />
      <Modal open={modal === "edit"} onClose={close} title={m.name} editor compact>
        {modal === "edit" && <ModelForm m={m} onDone={close} />}
      </Modal>
      {/* a model somebody works on can't go: say who, nothing to confirm */}
      <QuestionModal open={modal === "del" && m.usedBy.length > 0} title="Удалить модель нельзя" onCancel={close}
        text={`Её используют: ${m.usedBy.join(", ")}. Сначала выберите им другую модель.`} />
      <ConfirmModal open={modal === "del" && m.usedBy.length === 0} onClose={close} title={`Удалить модель «${m.name}»?`} pending={deleting} error={delError}
        text="Действие нельзя отменить."
        onConfirm={() => startDel(async () => {
          const r = await deleteModel(m.id);
          if (r?.error) setDelError(r.error); else { toast(r!.ok!); close(); }
        })} />
    </>
  );
}
