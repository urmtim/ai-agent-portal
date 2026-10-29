"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { ICONS, IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { createAgent, deleteAgentById, runAgentById } from "./actions";

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
      <button type="button" className="btn primary spacer" onClick={() => setOpen(true)}>+ Новый агент</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Новый агент">
        {open && <NewAgentForm onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

export function AgentActions({ id, name }: { id: string; name: string }) {
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
      <Link href={`/agents/${id}`} className="ibtn" title="Настроить" aria-label="Настроить" data-row-open>{ICONS.edit}</Link>
      <IconButton icon="del" title="Удалить" onClick={() => setConfirm(true)} />
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title="Удалить агента?" pending={deleting}
        text={<>«{name}» и история его прогонов будут удалены. Собранные чеки останутся в «Тратах».</>}
        onConfirm={remove} />
    </>
  );
}
