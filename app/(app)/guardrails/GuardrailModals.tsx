"use client";

import { useEffect, useState, useTransition } from "react";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { DOC_ACCEPT } from "@/lib/guardrail-docs";
import { deleteGuardrailDoc, saveGuardrailDoc } from "./actions";

/** What the browser knows about a document — never the file or its text. */
export type DocRowData = { id: string; name: string; description: string; file: string; enabled: boolean };

function DocForm({ d, onDone }: { d?: DocRowData; onDone: () => void }) {
  const toast = useToast();
  const [state, onSubmit, pending] = useFormAction(saveGuardrailDoc, undefined);
  const [enabled, setEnabled] = useState(d?.enabled ?? true);
  useEffect(() => { if (state?.ok) { toast(state.ok); onDone(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form onSubmit={onSubmit}>
      {d && <input type="hidden" name="id" value={d.id} />}
      <div className="field">
        <Switch name="enabled" checked={enabled} onChange={setEnabled} label="Включён" />
        <div className="hint">Выключенный документ не передаётся агентам, но остаётся у них в списке.</div>
      </div>
      <div className="field">
        <label htmlFor="gd-file">Файл{!d && <span className="req"> *</span>}</label>
        <input id="gd-file" name="file" type="file" accept={DOC_ACCEPT} required={!d} />
        <div className="hint">{d ? <>Сейчас: {d.file}. Выберите новый, чтобы заменить.</> : "docx, pdf, txt или md, до 4 МБ. Агент получит текст документа как обязательные правила."}</div>
      </div>
      <div className="field">
        <label htmlFor="gd-name">Название</label>
        <input id="gd-name" name="name" defaultValue={d?.name} placeholder="по умолчанию — имя файла" maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="gd-desc">Описание</label>
        <textarea id="gd-desc" name="description" rows={3} maxLength={500} defaultValue={d?.description} placeholder="О чём правила — видно в таблицах" />
      </div>
      {state?.error && <div className="formerr">{state.error}</div>}
      <div className="mfoot">
        <span className="spacer" />
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</button>
      </div>
    </form>
  );
}

export function AddDocButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary spacer" onClick={() => setOpen(true)}>Добавить документ</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Новый документ">
        {open && <DocForm onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

export function DocActions({ d, usedBy }: { d: DocRowData; usedBy: number }) {
  const toast = useToast();
  const [modal, setModal] = useState<"edit" | "del" | null>(null);
  const [deleting, startDel] = useTransition();
  const close = () => setModal(null);
  return (
    <>
      <IconButton icon="edit" title="Изменить" data-row-open onClick={() => setModal("edit")} />
      <IconButton icon="del" title="Удалить" onClick={() => setModal("del")} />
      <Modal open={modal === "edit"} onClose={close} title={d.name}>
        {modal === "edit" && <DocForm d={d} onDone={close} />}
      </Modal>
      <ConfirmModal open={modal === "del"} onClose={close} title="Удалить документ?" pending={deleting}
        text={<>«{d.name}» будет удалён{usedBy ? ` и пропадёт из гардрейлов у ${usedBy}` : ""}.</>}
        onConfirm={() => startDel(async () => { const r = await deleteGuardrailDoc(d.id); toast(r?.ok ?? r?.error ?? "Готово"); close(); })} />
    </>
  );
}
