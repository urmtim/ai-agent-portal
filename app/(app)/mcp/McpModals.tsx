"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { SecretInput } from "@/components/ui/SecretInput";
import { CONNECTORS, MAIL_PRESETS, type MailPreset } from "@/lib/connectors";
import { checkConnection, deleteConnection, saveConnection, testConnection, type FormState, type TestState } from "./actions";

/** What the browser knows about a connection — never the password. */
export type ConnectionRowData = {
  id: string; kind: string; name: string; preset: MailPreset; host: string; port: number; secure: boolean; user: string; hasSecret: boolean;
};

const HOW_TO: Record<MailPreset, string> = {
  mailru: "Нужен пароль для внешних приложений: Mail.ru → Настройки → Безопасность → Пароли для внешних приложений.",
  yandex: "Нужен пароль приложения (id.yandex.ru → Безопасность → Пароли приложений) и включённый IMAP в настройках почты.",
  gmail: "Нужен пароль приложения (включите двухэтапную аутентификацию) и включённый IMAP в настройках Gmail.",
  other: "Укажите IMAP-сервер вашей почты. Обычно порт 993 с SSL.",
};

function ConnectionForm({ c, onDone }: { c?: ConnectionRowData; onDone: () => void }) {
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [state, onSubmit, pending] = useFormAction(saveConnection, undefined);
  const [preset, setPreset] = useState<MailPreset>(c?.preset ?? "mailru");
  const [test, setTest] = useState<TestState | "checking">();
  const [testing, startTest] = useTransition();
  const [errFor, setErrFor] = useState<FormState>();
  useEffect(() => { if (state?.ok) { toast(state.ok); onDone(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const error = state?.error && errFor !== state ? state.error : undefined;

  function check() {
    setTest("checking");
    startTest(async () => setTest(await testConnection(new FormData(form.current!))));
  }

  return (
    <form ref={form} onSubmit={onSubmit} onInput={() => setErrFor(state)} autoComplete="off">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid cols2" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="cn-kind">Коннектор</label>
          <select id="cn-kind" name="kind" defaultValue={c?.kind ?? "mail"} disabled={!!c}>
            {Object.entries(CONNECTORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cn-name">Название</label>
          <input id="cn-name" name="name" defaultValue={c?.name} placeholder="например, Личная почта" maxLength={80} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="cn-preset">Почтовый сервис</label>
        <select id="cn-preset" name="preset" value={preset} onChange={(e) => setPreset(e.target.value as MailPreset)}>
          {Object.entries(MAIL_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div className="hint">{HOW_TO[preset]}</div>
      </div>
      {preset === "other" && (
        <div className="grid cols3" style={{ gap: 14, marginBottom: 14 }}>
          <div style={{ gridColumn: "span 2" }}>
            <label htmlFor="cn-host">IMAP-сервер <span className="req">*</span></label>
            <input id="cn-host" name="host" defaultValue={c?.preset === "other" ? c.host : ""} placeholder="imap.example.ru" />
          </div>
          <div>
            <label htmlFor="cn-port">Порт</label>
            <input id="cn-port" name="port" type="number" min={1} max={65535} defaultValue={c?.preset === "other" ? c.port : 993} />
          </div>
          <label className="toggle" style={{ gridColumn: "span 3" }}>
            <input type="checkbox" name="secure" defaultChecked={c?.preset === "other" ? c.secure : true} /><span>SSL</span>
          </label>
        </div>
      )}
      <div className="grid cols2" style={{ gap: 14 }}>
        <div>
          <label htmlFor="cn-user">Логин <span className="req">*</span></label>
          <input id="cn-user" name="user" defaultValue={c?.user} placeholder="you@mail.ru" autoComplete="off" required />
        </div>
        <div>
          <label htmlFor="cn-pass">Пароль приложения {!c && <span className="req">*</span>}</label>
          <SecretInput id="cn-pass" name="password" label="пароль"
            placeholder={c?.hasSecret ? "Пароль сохранён" : "пароль приложения"} />
        </div>
      </div>
      {c?.hasSecret && <div className="hint">Пароль сохранён. Чтобы заменить — впишите новый; пустое поле оставит прежний.</div>}
      {test && (
        <div className={`status ${test === "checking" ? "checking" : test.ok ? "ok" : "err"}`} role="status">
          {test === "checking" ? <><span className="spin" /> Подключаемся к ящику…</> : test.message}
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

export function AddConnectionButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary spacer" onClick={() => setOpen(true)}>Добавить</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Новое подключение">
        {open && <ConnectionForm onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

export function ConnectionActions({ c, usedBy }: { c: ConnectionRowData; usedBy: number }) {
  const toast = useToast();
  const [modal, setModal] = useState<"edit" | "del" | null>(null);
  const [checking, startCheck] = useTransition();
  const [deleting, startDel] = useTransition();
  const close = () => setModal(null);

  return (
    <>
      <IconButton icon="check" title={checking ? "Проверяем…" : "Проверить"} disabled={checking}
        onClick={() => startCheck(async () => { const r = await checkConnection(c.id); if (r) toast(r.message); })} />
      <IconButton icon="edit" title="Изменить" data-row-open onClick={() => setModal("edit")} />
      <IconButton icon="del" title="Удалить" onClick={() => setModal("del")} />
      <Modal open={modal === "edit"} onClose={close} title="Изменить подключение">
        {modal === "edit" && <ConnectionForm c={c} onDone={close} />}
      </Modal>
      <ConfirmModal open={modal === "del"} onClose={close} title="Удалить подключение?" pending={deleting}
        text={<>«{c.name}» будет удалено{usedBy ? ` — его используют: ${usedBy}. Они перестанут получать к нему доступ` : ""}.</>}
        onConfirm={() => startDel(async () => { const r = await deleteConnection(c.id); toast(r?.ok ?? r?.error ?? "Готово"); close(); })} />
    </>
  );
}
