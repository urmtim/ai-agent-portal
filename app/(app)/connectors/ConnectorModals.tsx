"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ConfirmModal, Modal, QuestionModal, useModalHead, useUnsavedGuard } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { FormTabs } from "@/components/ui/TablePart";
import { Switch } from "@/components/ui/Switch";
import { YamlEditor } from "@/components/ui/YamlEditor";
import { SecretInput } from "@/components/ui/SecretInput";
import { CONNECTORS, switchProtocol, type ConnectorField, type ConnectorKind } from "@/lib/connectors";
import { EMPTY_FIELDS, fieldsToYaml, yamlToFields, type ConnectorFields } from "@/lib/connector-spec";
import { checkConnector, deleteConnector, saveConnector, testConnector, type TestState } from "./actions";

/** What the browser knows about a connector — never its password or token. `usedBy` — who has it on their «Коннекторы» tab. */
export type ConnectorRowData = { id: string; fields: ConnectorFields; hasSecret: boolean; usedBy: string[] };

type Tab = "general" | "connection" | "yaml";
const INPUT_OF: Record<ConnectorField, string> = {
  name: "cn-name", host: "cn-host", port: "cn-port", smtpHost: "cn-smtp", smtpPort: "cn-smtpport", user: "cn-user", password: "cn-secret", url: "cn-url", token: "cn-secret",
};
const URL_RE = /^https?:\/\/[^\s/]+/i;

/**
 * The connector window, the same size as the model and agent windows: the on/off slider in the header,
 * «Общее · Подключение · YAML» and «Сохранить». «Тип» heads «Подключение» and swaps the fields below it;
 * a saved connector keeps its type. «Проверить» and «Сохранить» check fields top to bottom and show only the first problem.
 */
function ConnectorForm({ c, onDone }: { c?: ConnectorRowData; onDone: () => void }) {
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, submit, pending] = useFormAction(saveConnector, undefined);
  useEffect(() => { if (state?.ok) { toast(state.ok); onDone(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const [initial] = useState<ConnectorFields>(() => c?.fields ?? EMPTY_FIELDS);
  const [f, setF] = useState<ConnectorFields>(initial);
  const [secret, setSecret] = useState("");
  const [tab, setTab] = useState<Tab>("general");
  const [err, setErr] = useState<{ field: ConnectorField; text: string }>();
  const [test, setTest] = useState<TestState | "checking">();
  const [, startTest] = useTransition();
  const head = useModalHead();
  const mail = f.kind === "mail";

  const upd = (patch: Partial<ConnectorFields>, field?: ConnectorField) => {
    setF((p) => ({ ...p, ...patch }));
    if (field && err?.field === field) setErr(undefined);
  };
  const dirty = JSON.stringify(f) !== JSON.stringify(initial) || secret !== "";
  useUnsavedGuard(dirty);

  useEffect(() => { if (state?.error && state.field) show(state.field, state.error); }, [state]);
  function show(field: ConnectorField, text: string) {
    setErr({ field, text });
    setTab(field === "name" ? "general" : "connection");
    requestAnimationFrame(() => document.getElementById(INPUT_OF[field])?.focus());
  }

  // top to bottom, the first problem only; a saved password or token may stay empty
  function connectionProblem(): [ConnectorField, string] | null {
    if (!mail) {
      if (!f.url.trim()) return ["url", "Укажите адрес API"];
      if (!URL_RE.test(f.url.trim())) return ["url", "Адрес должен начинаться с http:// или https://"];
      return null;
    }
    if (!f.host.trim()) return ["host", "Укажите сервер входящей почты"];
    if (!f.port.trim()) return ["port", "Укажите порт"];
    if (!f.user.trim()) return ["user", "Укажите логин"];
    if (!secret && !c?.hasSecret) return ["password", "Укажите пароль"];
    return null;
  }
  function check() {
    const p = connectionProblem();
    if (p) { setTest(undefined); show(p[0], p[1]); return; }
    setTest("checking");
    setErr(undefined);
    startTest(async () => {
      const r = await testConnector(new FormData(form.current!));
      setTest(r);
      // the result sits next to «Проверить»; the field it is about only turns red
      if (!r.ok && r.field) setErr({ field: r.field, text: "" });
    });
  }
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const p = !f.name.trim() ? (["name", "Укажите название"] as [ConnectorField, string]) : connectionProblem();
    if (p) { e.preventDefault(); show(p[0], p[1]); return; }
    submit(e);
  }

  // ---- YAML: generated when the tab opens; every edit there fills the other tabs ----
  const [yaml, setYaml] = useState("");
  const [yamlNote, setYamlNote] = useState<{ error?: string; warnings: string[] }>({ warnings: [] });
  const [askUpload, setAskUpload] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  function openTab(k: Tab) {
    if (k === "yaml") { setYaml(fieldsToYaml(f)); setYamlNote({ warnings: [] }); }
    setTab(k);
  }
  function applyYaml(text: string) {
    setYaml(text);
    const r = yamlToFields(text, f, !!c);
    if ("error" in r) { setYamlNote({ error: r.error, warnings: [] }); return; }
    setF(r.fields);
    setErr(undefined);
    setYamlNote({ warnings: r.warnings });
  }
  function download() {
    const text = tab === "yaml" ? yaml : fieldsToYaml(f);
    const url = URL.createObjectURL(new Blob([text], { type: "application/yaml;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(f.name.trim() || "коннектор").replace(/[\\/:*?"<>|]+/g, "_")}.yaml`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) applyYaml(await file.text());
  }

  const fieldErr = (field: ConnectorField) => err?.field === field && err.text ? <div className="ferr" role="alert">{err.text}</div> : null;
  const bad = (field: ConnectorField) => (err?.field === field ? "bad" : undefined);
  const generalError = state?.error && !state.field ? state.error : undefined;
  const testCls = test === "checking" ? "checking" : test?.ok ? "ok" : "err";
  const row = { display: "grid", gridTemplateColumns: "130px 1fr 110px", gap: 14 };
  const half = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };

  return (
    <form ref={form} onSubmit={onSubmit} noValidate autoComplete="off">
      {c && <input type="hidden" name="id" value={c.id} />}
      <input type="hidden" name="kind" value={f.kind} />
      <FormTabs active={tab} onChange={openTab} tabs={[{ key: "general", label: "Общее" }, { key: "connection", label: "Подключение" }, { key: "yaml", label: "YAML" }]} />

      <div className="apanel fill" hidden={tab !== "general"}>
        <div className="field">
          <label htmlFor="cn-name">Название <span className="req">*</span></label>
          <input id="cn-name" name="name" autoComplete="off" className={bad("name")} value={f.name} maxLength={80}
            onChange={(e) => upd({ name: e.target.value }, "name")} placeholder={mail ? "например, Моя почта" : "например, Курсы валют"} />
          {fieldErr("name")}
        </div>
        <div className="field grow half">
          <label htmlFor="cn-desc">Описание</label>
          <textarea id="cn-desc" name="description" value={f.description} maxLength={300} onChange={(e) => upd({ description: e.target.value })} placeholder="Для чего это подключение" />
        </div>
      </div>

      <div className={mail ? "apanel tight" : "apanel"} hidden={tab !== "connection"}>
        <div className="field">
          <label htmlFor="cn-kind">Тип <span className="req">*</span></label>
          <select id="cn-kind" value={f.kind} disabled={!!c}
            onChange={(e) => { upd({ kind: e.target.value as ConnectorKind }); setErr(undefined); setTest(undefined); setSecret(""); }}>
            {(Object.keys(CONNECTORS) as ConnectorKind[]).map((k) => <option key={k} value={k}>{CONNECTORS[k].label}</option>)}
          </select>
        </div>

        {mail ? (
          <>
            <div style={row}>
              <div className="field">
                <label htmlFor="cn-proto">Получение</label>
                <select id="cn-proto" name="protocol" value={f.protocol}
                  onChange={(e) => { const to = e.target.value as "imap" | "pop3"; const s = switchProtocol(f.host, to); upd({ protocol: to, host: s.host, port: String(s.port) }); }}>
                  <option value="imap">IMAP</option>
                  <option value="pop3">POP3</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="cn-host">Сервер входящей почты <span className="req">*</span></label>
                <input id="cn-host" name="host" autoComplete="off" className={bad("host")} value={f.host} onChange={(e) => upd({ host: e.target.value }, "host")} placeholder="например, imap.mail.ru" />
                {fieldErr("host")}
              </div>
              <div className="field">
                <label htmlFor="cn-port">Порт <span className="req">*</span></label>
                <input id="cn-port" name="port" type="number" min={1} max={65535} autoComplete="off" className={bad("port")} value={f.port} onChange={(e) => upd({ port: e.target.value }, "port")} />
                {fieldErr("port")}
              </div>
            </div>
            <div style={row}>
              <div className="field">
                <label htmlFor="cn-out">Отправка</label>
                <input id="cn-out" value="SMTP" disabled />
              </div>
              <div className="field">
                <label htmlFor="cn-smtp">Сервер исходящей почты</label>
                <input id="cn-smtp" name="smtpHost" autoComplete="off" className={bad("smtpHost")} value={f.smtpHost} onChange={(e) => upd({ smtpHost: e.target.value }, "smtpHost")} placeholder="например, smtp.mail.ru" />
                {fieldErr("smtpHost")}
              </div>
              <div className="field">
                <label htmlFor="cn-smtpport">Порт</label>
                <input id="cn-smtpport" name="smtpPort" type="number" min={1} max={65535} autoComplete="off" className={bad("smtpPort")} value={f.smtpPort} onChange={(e) => upd({ smtpPort: e.target.value }, "smtpPort")} />
                {fieldErr("smtpPort")}
              </div>
            </div>
            <div style={half}>
              <div className="field">
                <label htmlFor="cn-user">Логин <span className="req">*</span></label>
                <input id="cn-user" name="user" autoComplete="off" className={bad("user")} value={f.user} onChange={(e) => upd({ user: e.target.value }, "user")} placeholder="you@mail.ru" />
                {fieldErr("user")}
              </div>
              <div className="field">
                <label htmlFor="cn-secret">Пароль приложения <span className="req">*</span></label>
                <SecretInput id="cn-secret" name="secret" label="пароль" className={bad("password")} value={secret}
                  onChange={(e) => { setSecret(e.target.value); if (err?.field === "password") setErr(undefined); }}
                  placeholder={c?.hasSecret ? "Пароль сохранён" : undefined} />
                {fieldErr("password")}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="cn-url">Адрес API <span className="req">*</span></label>
              <input id="cn-url" name="url" autoComplete="off" className={bad("url")} value={f.url} onChange={(e) => upd({ url: e.target.value }, "url")} placeholder="например, https://api.example.ru/v1" />
              {fieldErr("url")}
            </div>
            <div className="field">
              <label htmlFor="cn-secret">Токен</label>
              <SecretInput id="cn-secret" name="secret" className={bad("token")} value={secret}
                onChange={(e) => { setSecret(e.target.value); if (err?.field === "token") setErr(undefined); }}
                placeholder={c?.hasSecret ? "Токен сохранён" : undefined} />
              {fieldErr("token")}
            </div>
          </>
        )}
        <div className="checkrow">
          <button type="button" className="btn ghost" onClick={check} disabled={test === "checking"}>Проверить</button>
          {test && (
            <span className={`status ${testCls}`} role="status">
              {test === "checking" ? <><span className="spin" /> Проверяем подключение…</> : test.message}
            </span>
          )}
        </div>
      </div>

      <div className="apanel yamlpanel" hidden={tab !== "yaml"}>
        <YamlEditor label="YAML коннектора" value={yaml} onChange={applyYaml} />
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

      {/* «Включён» sits in the window's header, outside the form: it is submitted from here */}
      {head && createPortal(
        <Switch checked={f.enabled} onChange={(enabled) => upd({ enabled })} title={f.enabled ? "Коннектор включён" : "Коннектор выключен"} />, head)}
      {f.enabled && <input type="hidden" name="enabled" value="on" />}

      {generalError && <div className="formerr">{generalError}</div>}
      <div className="mfoot">
        <span className="spacer" />
        <button className="btn primary" type="submit" disabled={pending || (!!c && !dirty)}>{pending ? "Сохраняем…" : "Сохранить"}</button>
      </div>
      <QuestionModal open={askUpload} title="Загрузить YAML?" text="Текущие настройки будут заменены данными из файла."
        confirmLabel="Заменить" onCancel={() => setAskUpload(false)}
        onConfirm={() => { setAskUpload(false); fileInput.current?.click(); }} />
    </form>
  );
}

export function AddConnectorButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary spacer" onClick={() => setOpen(true)}>Добавить</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Новый коннектор" editor>
        {open && <ConnectorForm onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

export function ConnectorActions({ c }: { c: ConnectorRowData }) {
  const toast = useToast();
  const [modal, setModal] = useState<"edit" | "del" | null>(null);
  const [checking, startCheck] = useTransition();
  const [deleting, startDel] = useTransition();
  const close = () => setModal(null);

  return (
    <>
      <IconButton icon="check" title={checking ? "Проверяем…" : "Проверить"} disabled={checking}
        onClick={() => startCheck(async () => { const r = await checkConnector(c.id); toast(r.message); })} />
      <IconButton icon="edit" title="Изменить" data-row-open onClick={() => setModal("edit")} />
      <IconButton icon="del" title="Удалить" onClick={() => setModal("del")} />
      <Modal open={modal === "edit"} onClose={close} title={c.fields.name} editor>
        {modal === "edit" && <ConnectorForm c={c} onDone={close} />}
      </Modal>
      <ConfirmModal open={modal === "del"} onClose={close} title={`Удалить «${c.fields.name}»?`} pending={deleting}
        text={<>{c.usedBy.length ? `Его используют: ${c.usedBy.join(", ")}. У них он пропадёт. ` : ""}Действие нельзя отменить.</>}
        onConfirm={() => startDel(async () => { const r = await deleteConnector(c.id); toast(r?.ok ?? r?.error ?? "Готово"); close(); })} />
    </>
  );
}
