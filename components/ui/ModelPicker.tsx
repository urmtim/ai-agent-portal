"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * «Модель» in the model window: a text field with its own suggestion menu (not the browser's datalist).
 * The menu opens on click/focus, filters by what is typed, marks the chosen one with ✓, works with ↑ ↓ Enter Esc
 * (Esc closes only the menu). It sits over the window (portal, fixed) so the scrolling tab never clips it.
 * Without options it is a plain field. Nothing is ever picked by itself.
 */
export function ModelPicker({ id, value, options, onChange, disabled, placeholder, invalid }: {
  id: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  invalid?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(true); // just opened: the whole list; typing filters
  const [act, setAct] = useState(-1);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number }>();

  const q = value.trim().toLowerCase();
  const list = all || !q ? options : options.filter((m) => m.toLowerCase().includes(q));
  const shown = open && options.length > 0 && !disabled;

  function openMenu(whole: boolean) {
    if (!options.length || disabled) return;
    const r = input.current!.getBoundingClientRect();
    // .cmenu is at most 232px high: open upwards when there is no room below the field
    const below = window.innerHeight - r.bottom >= 250 || r.top < 250;
    setPos(below ? { left: r.left, width: r.width, top: r.bottom + 6 } : { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 6 });
    setAll(whole); setAct(-1); setOpen(true);
  }
  const close = () => { setOpen(false); setAct(-1); };
  const pick = (v: string) => { onChange(v); close(); };
  // scrolls only the menu itself — scrollIntoView could move the window under it and so close it
  const reveal = (el: Element | null | undefined, center: boolean) => {
    const m = menu.current;
    if (!(el instanceof HTMLElement) || !m) return;
    if (center) m.scrollTop = el.offsetTop - (m.clientHeight - el.offsetHeight) / 2;
    else if (el.offsetTop < m.scrollTop) m.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > m.scrollTop + m.clientHeight) m.scrollTop = el.offsetTop + el.offsetHeight - m.clientHeight;
  };

  // the window's tab scrolls or the page resizes: the menu would drift away from the field (its own scroll is fine)
  useEffect(() => {
    if (!shown) return;
    reveal(menu.current?.querySelector(".sel"), true);
    const off = (e: Event) => { if (!(e.target instanceof Node && menu.current?.contains(e.target))) close(); };
    window.addEventListener("resize", off);
    document.addEventListener("scroll", off, true);
    return () => { window.removeEventListener("resize", off); document.removeEventListener("scroll", off, true); };
  }, [shown]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape" && shown) { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); close(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!shown) { openMenu(true); return; }
      if (!list.length) return;
      setAct((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length);
    }
    if (e.key === "Enter" && shown && act >= 0 && list[act]) { e.preventDefault(); pick(list[act]); }
  }

  return (
    <>
      <input ref={input} id={id} value={value} disabled={disabled} placeholder={placeholder} autoComplete="off"
        role="combobox" aria-expanded={shown} aria-controls={`${id}-menu`} aria-invalid={invalid || undefined}
        className={[options.length && !disabled ? "pick" : "", invalid ? "bad" : ""].filter(Boolean).join(" ") || undefined}
        onFocus={() => openMenu(true)} onClick={() => { if (!shown) openMenu(true); }} onBlur={close} onKeyDown={onKey}
        onChange={(e) => { onChange(e.target.value); if (options.length) { if (!open) openMenu(false); else setAll(false); setAct(-1); } }} />
      {shown && pos && createPortal(
        <div ref={menu} className="cmenu" id={`${id}-menu`} role="listbox" style={pos} onMouseDown={(e) => e.preventDefault()}>
          {list.length ? list.map((m, i) => (
            <button key={m} type="button" role="option" aria-selected={m === value}
              className={[m === value ? "sel" : "", i === act ? "act" : ""].filter(Boolean).join(" ") || undefined}
              ref={(el) => { if (el && i === act) reveal(el, false); }}
              onClick={() => pick(m)}>{m}</button>
          )) : <div className="none">Нет совпадений — можно оставить своё название</div>}
        </div>,
        document.body,
      )}
    </>
  );
}
