"use client";

import { useEffect, useId, useRef } from "react";

/** Centered dialog over a blurred backdrop. Closes only by × or its own buttons — a stray click or Esc must not lose what was typed. */
export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="mbg">
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className="mclose" aria-label="Закрыть" onClick={onClose}>×</button>
        <h2 className="mtitle" id={titleId} style={sub ? undefined : { marginBottom: 18 }}>{title}</h2>
        {sub && <p className="msub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

/** Confirmation dialog for deletes. */
export function ConfirmModal({
  open,
  onClose,
  title,
  text,
  confirmLabel = "Удалить",
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  text: React.ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  error?: string;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} sub={text}>
      {error && <div className="formerr">{error}</div>}
      <div className="mfoot">
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
        <button type="button" className="btn danger" disabled={pending} onClick={onConfirm}>
          {pending ? "Удаляем…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
