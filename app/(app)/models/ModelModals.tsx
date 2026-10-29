"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { checkSavedModel, deleteModel, saveModel, testModel, type FormState, type TestState } from "./actions";

/** What the browser knows about a model — never the token itself. */
export type ModelRowData = { id: string; name: string; baseUrl: string; model: string; isDefault: boolean; hasToken: boolean };

function ModelForm({ m, onDone }: { m?: ModelRowData; onDone: () => void }) {
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

  function check() {
    setTest("checking");
    startTest(async () => setTest(await testModel(new FormData(form.current!))));
  }

  return (
    <form ref={form} onSubmit={onSubmit} onInput={() => setErrFor(state)}>
      {m && <input type="hidden" name="id" value={m.id} />}
      <div className="field">
        <label htmlFor="md-name">Название</label>
        <input id="md-name" name="name" defaultValue={m?.name} placeholder="например, GLM-4" />
      </div>
      <div className="field">
        <label htmlFor="md-url">Адрес API <span className="req">*</span></label>
        <input id="md-url" name="baseUrl" defaultValue={m?.baseUrl} placeholder="http://localhost:11434/v1" required />
        <div className="hint">Адрес до <code>/v1</code> — Ollama, GLM или другой OpenAI-совместимый.</div>
      </div>
      <div className="grid cols2" style={{ gap: 14 }}>
        <div>
          <label htmlFor="md-model">Модель <span className="req">*</span></label>
          <input id="md-model" name="model" defaultValue={m?.model} placeholder="glm-4" required />
        </div>
        <div>
          <label htmlFor="md-token">Токен</label>
          <div className="pwd">
            <input id="md-token" name="token" type={showToken ? "text" : "password"} autoComplete="off"
              placeholder={m?.hasToken ? "Токен сохранён" : "sk-…"} />
            <button type="button" onClick={() => setShowToken((v) => !v)}
              aria-label={showToken ? "Скрыть токен" : "Показать токен"} title={showToken ? "Скрыть" : "Показать"}>
              {showToken ? "🙈" : "👁"}
            </button>
          </div>
        </div>
      </div>
      {m?.hasToken && <div className="hint">Токен сохранён. Чтобы заменить — впишите новый; пустое поле оставит прежний.</div>}
      <div className="wrap-gap" style={{ marginTop: 16, gap: 18 }}>
        <label className="toggle">
          <input type="checkbox" name="isDefault" defaultChecked={m?.isDefault} disabled={m?.isDefault} />
          <span>Сделать моделью по умолчанию</span>
        </label>
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

export function AddModelButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary spacer" onClick={() => setOpen(true)}>+ Добавить модель</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Новая модель">
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
      <IconButton icon="del" title={m.isDefault ? "Модель по умолчанию удалить нельзя" : "Удалить"} disabled={m.isDefault}
        onClick={() => setModal("del")} />
      <Modal open={modal === "edit"} onClose={close} title="Изменить модель">
        {modal === "edit" && <ModelForm m={m} onDone={close} />}
      </Modal>
      <ConfirmModal open={modal === "del"} onClose={close} title="Удалить модель?" pending={deleting} error={delError}
        text={<>«{m.name}» будет удалена. Агенты на этой модели перейдут на модель по умолчанию.</>}
        onConfirm={() => startDel(async () => {
          const r = await deleteModel(m.id);
          if (r?.error) setDelError(r.error); else { toast(r!.ok!); close(); }
        })} />
    </>
  );
}
