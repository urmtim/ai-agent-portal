"use client";

import { useEffect, useState, useTransition } from "react";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { createAgent, deleteAgentById, runAgentById, updateAgent } from "./actions";

const TYPES = [{ value: "RECEIPTS", label: "Чеки из почты", desc: "Читает письма → пишет в «Траты»" }];

function NewAgentForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [state, onSubmit, pending] = useFormAction(createAgent, undefined);
  useEffect(() => { if (state?.ok) { toast(state.ok); onDone(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="ag-type">Тип агента</label>
        <select id="ag-type" name="type" defaultValue="RECEIPTS">
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <div className="hint">{TYPES[0].desc}. Другие типы появятся вместе с конструктором.</div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="ag-name">Название</label>
        <input id="ag-name" name="name" placeholder="Чеки из почты" />
      </div>
      {state?.error && <div className="formerr">{state.error}</div>}
      <div className="mfoot">
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onDone}>Отмена</button>
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Создаём…" : "Создать"}</button>
      </div>
    </form>
  );
}

export function NewAgentButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary spacer" onClick={() => setOpen(true)}>Новый агент</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Новый агент">
        {open && <NewAgentForm onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

/** What the «Изменить агента» modal edits; built on the server from the Agent row. */
export type AgentEditData = { id: string; name: string; enabled: boolean; modelId: string | null; sinceDays: number; max: number; fromFilter: string };
export type ModelChoices = { models: { id: string; name: string }[]; defaultModel: string };

function AgentEditForm({ a, models, defaultModel, onDone }: { a: AgentEditData; onDone: () => void } & ModelChoices) {
  const toast = useToast();
  const [state, onSubmit, pending] = useFormAction(updateAgent, undefined);
  useEffect(() => { if (state?.ok) { toast(state.ok); onDone(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="agentId" value={a.id} />
      <div className="field">
        <label htmlFor="ag-ename">Название</label>
        <input id="ag-ename" name="name" defaultValue={a.name} required maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="ag-model">Модель</label>
        <select id="ag-model" name="modelId" defaultValue={a.modelId ?? ""}>
          <option value="">По умолчанию — {defaultModel}</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="grid cols2" style={{ gap: 14 }}>
        <div>
          <label htmlFor="ag-days">За сколько дней смотреть</label>
          <input id="ag-days" name="sinceDays" type="number" min={1} max={365} defaultValue={a.sinceDays} />
        </div>
        <div>
          <label htmlFor="ag-max">Макс. писем за прогон</label>
          <input id="ag-max" name="max" type="number" min={1} max={200} defaultValue={a.max} />
        </div>
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="ag-from">Фильтр по отправителю</label>
        <input id="ag-from" name="fromFilter" placeholder="например, pyaterochka" defaultValue={a.fromFilter} />
      </div>
      <label className="toggle"><input type="checkbox" name="enabled" defaultChecked={a.enabled} /><span>Агент включён</span></label>
      {state?.error && <div className="formerr" style={{ marginTop: 14 }}>{state.error}</div>}
      <div className="mfoot">
        <span className="spacer" />
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</button>
      </div>
    </form>
  );
}

/** «Изменить» button for the agent page; opens the same modal as the table row. */
export function AgentEditButton({ a, ...choices }: { a: AgentEditData } & ModelChoices) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn ghost" onClick={() => setOpen(true)}>Изменить</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Изменить агента">
        {open && <AgentEditForm a={a} {...choices} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

export function AgentActions({ a, ...choices }: { a: AgentEditData } & ModelChoices) {
  const { id, name } = a;
  const [edit, setEdit] = useState(false);
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [running, startRun] = useTransition();
  const [deleting, startDel] = useTransition();

  function run() {
    startRun(async () => {
      const r = await runAgentById(id);
      toast(r?.ok ?? r?.error ?? "Готово");
    });
  }
  function remove() {
    startDel(async () => {
      const r = await deleteAgentById(id);
      toast(r?.ok ?? r?.error ?? "Готово");
      setConfirm(false);
    });
  }

  return (
    <>
      <IconButton icon="run" title={running ? "Выполняется…" : "Запустить"} disabled={running} onClick={run} />
      <IconButton icon="edit" title="Изменить" data-row-open onClick={() => setEdit(true)} />
      <IconButton icon="del" title="Удалить" onClick={() => setConfirm(true)} />
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title="Удалить агента?" pending={deleting}
        text={<>«{name}» и история его прогонов будут удалены. Собранные чеки останутся в «Тратах».</>}
        onConfirm={remove} />
      <Modal open={edit} onClose={() => setEdit(false)} title="Изменить агента">
        {edit && <AgentEditForm a={a} {...choices} onDone={() => setEdit(false)} />}
      </Modal>
    </>
  );
}
