"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Open dialogs, newest last: Esc goes only to the top one (a question over a window must not close the window too).
const openStack: symbol[] = [];

type ModalCtx = { setUnsaved: (dirty: boolean) => void; head: HTMLElement | null };
const Ctx = createContext<ModalCtx | null>(null);

/** A form inside a Modal says whether it has unsaved changes: × and Esc then ask before closing. */
export function useUnsavedGuard(dirty: boolean) {
  const ctx = useContext(Ctx);
  const set = ctx?.setUnsaved;
  useEffect(() => {
    if (!set) return;
    set(dirty);
    return () => set(false);
  }, [set, dirty]);
}

/** The place in the editor window's header next to × (the agent's «Включён»); null outside such a window. */
export function useModalHead(): HTMLElement | null {
  return useContext(Ctx)?.head ?? null;
}

/**
 * Centered dialog over a blurred backdrop. Closes by ×, Esc or its own buttons — never by a stray click on the backdrop.
 * With unsaved changes (see useUnsavedGuard) × and Esc first ask «Закрыть без сохранения?».
 */
export function Modal({
  open,
  onClose,
  title,
  sub,
  wide,
  editor,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: React.ReactNode;
  /** Wider dialog for forms with tabs and tables (agent, assistant). */
  wide?: boolean;
  /** Editor window (agent, model): wide and of one constant size; header, tabs and footer stay, the tab body scrolls. */
  editor?: boolean;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const unsaved = useRef(false);
  const [head, setHead] = useState<HTMLElement | null>(null);
  const ctx = useMemo(() => ({ setUnsaved: (dirty: boolean) => { unsaved.current = dirty; }, head }), [head]);
  const [asking, setAsking] = useState(false);
  // parents pass a new onClose on every render; the Esc listener must not be re-made (and the question lost) for that
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const me = Symbol("modal");
    openStack.push(me);
    // the question is a modal of its own on top, so while it is open this one is not the top and ignores Esc
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || openStack[openStack.length - 1] !== me) return;
      if (unsaved.current) setAsking(true); else closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openStack.splice(openStack.indexOf(me), 1);
    };
  }, [open]);

  if (!open) return null;
  const tryClose = () => (unsaved.current ? setAsking(true) : onClose());
  const cls = editor ? "modal wide editor" : wide ? "modal wide" : "modal";
  // portal: opened from a table row, it must not inherit the cell's layout (td.acts is right-aligned)
  return createPortal(
    <div className="mbg">
      <div ref={ref} className={cls} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className="mclose" aria-label="Закрыть" title="Закрыть" onClick={tryClose}>
          {/* a drawn cross, as tall as the header's on/off slider; the same in every dialog */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg>
        </button>
        {editor ? (
          <div className="mhead">
            <h2 className="mtitle" id={titleId}>{title}</h2>
            <div className="mhead-slot" ref={setHead} />
          </div>
        ) : (
          <h2 className="mtitle" id={titleId} style={sub ? undefined : { marginBottom: 18 }}>{title}</h2>
        )}
        {sub && <p className="msub">{sub}</p>}
        <Ctx.Provider value={ctx}>{children}</Ctx.Provider>
      </div>
      <QuestionModal open={asking} title="Закрыть без сохранения?" text="Изменения будут потеряны."
        cancelLabel="Остаться" confirmLabel="Закрыть" onCancel={() => setAsking(false)}
        onConfirm={() => { setAsking(false); onClose(); }} />
    </div>,
    document.body,
  );
}

/** A question over another window: «Отмена» and a red action (or a single «Понятно» when there is nothing to do). */
export function QuestionModal({ open, title, text, cancelLabel = "Отмена", confirmLabel, onCancel, onConfirm }: {
  open: boolean;
  title: string;
  text: React.ReactNode;
  cancelLabel?: string;
  /** No confirmLabel → one primary button that just closes. */
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm?: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} sub={text}>
      <div className="mfoot">
        <span className="spacer" />
        {confirmLabel ? (
          <>
            <button type="button" className="btn ghost" onClick={onCancel}>{cancelLabel}</button>
            <button type="button" className="btn danger" onClick={onConfirm}>{confirmLabel}</button>
          </>
        ) : (
          <button type="button" className="btn primary" onClick={onCancel}>Понятно</button>
        )}
      </div>
    </Modal>
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
