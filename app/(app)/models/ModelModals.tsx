"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { Switch } from "@/components/ui/Switch";
import { FormTabs } from "@/components/ui/TablePart";
import { YamlEditor } from "@/components/ui/YamlEditor";
import { modelToYaml, yamlToModel } from "@/lib/model-spec";
import { checkSavedModel, deleteModel, saveModel, testModel, type FormState, type TestState } from "./actions";

/** What the browser knows about a model — never the token itself. */
export type ModelRowData = { id: string; name: string; baseUrl: string; model: string; isDefault: boolean; hasToken: boolean; contextTokens: number };

/** What the model window edits besides the token (the token is never shown or put into YAML). */
type Fields = { name: string; baseUrl: string; model: string; contextTokens: string; isDefault: boolean };
type Tab = "general" | "yaml";

/**
 * The model window (like the agent window): «Общее · YAML», «Проверить» and «Сохранить».
 * `first` — no models yet: this one becomes the default whatever the switch says, so the switch shows it.
 */
function ModelForm({ m, first, onDone }: { m?: ModelRowData; first?: boolean; onDone: () => void }) {
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, onSubmit, pending] = useFormAction(saveModel, undefined);
  const [test, setTest] = useState<TestState | "checking">();
  const [showToken, setShowToken] = useState(false);
  const [testing, startTest] = useTransition();
  // a save error is hidden once the fields change; the next save shows a fresh one
  const [errFor, setErrFor] = useState<FormState>();
  useEffect(() => { if (state?.ok) { toast(state.ok); onDone(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const error = state?.error && errFor !== state ? state.error : undefined;

  const [tab, setTab] = useState<Tab>("general");
  const [f, setF] = useState<Fields>({
    name: m?.name ?? "", baseUrl: m?.baseUrl ?? "", model: m?.model ?? "",
    contextTokens: String(m?.contextTokens ?? 32000), isDefault: m?.isDefault ?? !!first,
  });
  const upd = (patch: Partial<Fields>) => { setF((p) => ({ ...p, ...patch })); setErrFor(state); };
  const lockedDefault = !!(m?.isDefault || first);

  // ---- YAML: generated when the tab opens; every edit there fills «Общее» ----
  const toSpec = (v: Fields) => ({ name: v.name, baseUrl: v.baseUrl, model: v.model, contextTokens: Number(v.contextTokens) || 32000, isDefault: v.isDefault || lockedDefault });
  const [yaml, setYaml] = useState("");
  const [yamlNote, setYamlNote] = useState<{ error?: string; warnings: string[] }>({ warnings: [] });
  function openTab(k: Tab) {
    if (k === "yaml") { setYaml(modelToYaml(toSpec(f))); setYamlNote({ warnings: [] }); }
    setTab(k);
  }
  function applyYaml(text: string) {
    setYaml(text);
    const r = yamlToModel(text);
    if ("error" in r) { setYamlNote({ error: r.error, warnings: [] }); return; }
    const s = r.spec;
    upd({ name: s.name, baseUrl: s.baseUrl, model: s.model, contextTokens: String(s.contextTokens), isDefault: lockedDefault || s.isDefault });
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

  function check() {
    setTest("checking");
    startTest(async () => setTest(await testModel(new FormData(form.current!))));
  }

  return (
    <form ref={form} onSubmit={onSubmit}>
      {m && <input type="hidden" name="id" value={m.id} />}
      <FormTabs active={tab} onChange={openTab} tabs={[{ key: "general", label: "Общее" }, { key: "yaml", label: "YAML" }]} />

      <div className="apanel" hidden={tab !== "general"}>
        <div className="psec">
          <Switch name="isDefault" checked={f.isDefault || lockedDefault} disabled={lockedDefault} onChange={(isDefault) => upd({ isDefault })} label="Сделать моделью по умолчанию" />
          <div className="hint">
            {first ? "Это первая модель — она всегда становится моделью по умолчанию."
              : m?.isDefault ? "Это модель по умолчанию. Чтобы сменить, включите переключатель у другой модели."
              : "На ней работают новые агенты и чат, пока им не выбрали другую модель."}
          </div>
        </div>
        <div className="field">
          <label htmlFor="md-name">Название</label>
          <input id="md-name" name="name" value={f.name} onChange={(e) => upd({ name: e.target.value })} placeholder="например, GLM-4" maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="md-url">Адрес API <span className="req">*</span></label>
          <input id="md-url" name="baseUrl" value={f.baseUrl} onChange={(e) => upd({ baseUrl: e.target.value })} placeholder="http://localhost:11434/v1" required />
        </div>
        <div className="field">
          <label htmlFor="md-model">Модель <span className="req">*</span></label>
          <input id="md-model" name="model" value={f.model} onChange={(e) => upd({ model: e.target.value })} placeholder="glm-4" required />
        </div>
        <div className="field">
          <label htmlFor="md-token">Токен</label>
          <div className="pwd">
            <input id="md-token" name="token" type={showToken ? "text" : "password"} autoComplete="off" onChange={() => setErrFor(state)}
              placeholder={m?.hasToken ? "Токен сохранён" : "sk-…"} />
            <button type="button" onClick={() => setShowToken((v) => !v)}
              aria-label={showToken ? "Скрыть токен" : "Показать токен"} title={showToken ? "Скрыть" : "Показать"}>
              {showToken ? "🙈" : "👁"}
            </button>
          </div>
          {m?.hasToken && <div className="hint">Токен сохранён. Чтобы заменить — впишите новый; пустое поле оставит прежний.</div>}
        </div>
        <div className="field">
          <label htmlFor="md-ctx">Контекст, токенов</label>
          <input id="md-ctx" name="contextTokens" type="number" min={2000} max={2000000} step={1000} value={f.contextTokens} onChange={(e) => upd({ contextTokens: e.target.value })} />
          <div className="hint">Сколько модель держит в памяти. Длинный чат пересказывается, когда история подходит к 70 %.</div>
        </div>
      </div>

      <div className="apanel yamlpanel" hidden={tab !== "yaml"}>
        <YamlEditor label="YAML модели" value={yaml} onChange={applyYaml} />
        {yamlNote.error && <div className="formerr">{yamlNote.error}</div>}
        {yamlNote.warnings.length > 0 && (
          <div className="callout warn yaml-warn"><div>{yamlNote.warnings.map((w) => <div key={w}>{w}</div>)}</div></div>
        )}
        <div className="wrap-gap" style={{ marginTop: 12 }}>
          <button type="button" className="btn primary" onClick={download}>Скачать .yaml</button>
          <label className="btn primary">Загрузить .yaml<input type="file" accept=".yaml,.yml,text/yaml" hidden onChange={upload} /></label>
        </div>
      </div>

      {test && (
        <div className={`status ${test === "checking" ? "checking" : test.ok ? "ok" : "err"}`} role="status">
          {test === "checking" ? <><span className="spin" /> Проверяем подключение…</> : test.message}
        </div>
      )}
      {error && <div className="formerr">{error}</div>}
      <div className="mfoot">
        <button type="button" className="btn ghost" onClick={check} disabled={testing}>Проверить</button>
        <span className="spacer" />
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</button>
      </div>
    </form>
  );
}

/** `first` — the user has no models yet. */
export function AddModelButton({ first }: { first: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary spacer" onClick={() => setOpen(true)}>Добавить модель</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Новая модель" editor>
        {open && <ModelForm first={first} onDone={() => setOpen(false)} />}
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
      <Modal open={modal === "edit"} onClose={close} title={m.name} editor>
        {modal === "edit" && <ModelForm m={m} onDone={close} />}
      </Modal>
      <ConfirmModal open={modal === "del"} onClose={close} title="Удалить модель?" pending={deleting} error={delError}
        text={<>«{m.name}» будет удалена. Агенты и чат на этой модели перейдут на модель по умолчанию.{m.isDefault && " Это модель по умолчанию — ею станет самая ранняя из оставшихся."}</>}
        onConfirm={() => startDel(async () => {
          const r = await deleteModel(m.id);
          if (r?.error) setDelError(r.error); else { toast(r!.ok!); close(); }
        })} />
    </>
  );
}
