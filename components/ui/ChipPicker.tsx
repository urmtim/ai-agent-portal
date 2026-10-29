"use client";

import { useState } from "react";
import type { PartItem } from "./TablePart";

/**
 * Plaques of what was added, each with «×», and «+ Добавить» that unfolds the list of what is left right below
 * (inline, not a popover: the editor panel scrolls and would clip one). The parent keeps `picked`.
 */
export function ChipPicker({ items, picked, onChange, empty, nothingHint, tone, label = "Добавить" }: {
  items: PartItem[];
  picked: string[];
  onChange: (ids: string[]) => void;
  /** Shown as a crossed-out plaque when nothing is added. */
  empty?: string;
  /** Shown instead of «+ Добавить» when there is nothing that could ever be added (null → just the `empty` plaque). */
  nothingHint: React.ReactNode;
  tone?: "mcp";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const added = picked.map((id) => items.find((i) => i.id === id)).filter((i): i is PartItem => !!i);
  const left = items.filter((i) => !picked.includes(i.id));

  return (
    <div className="chips">
      {added.map((i) => (
        <span key={i.id} className={tone ? `npill ${tone}` : "npill"} title={i.desc}>
          {i.name}{i.note && <span className="muted"> · {i.note}</span>}
          <button type="button" className="x" aria-label={`Убрать «${i.name}»`} onClick={() => onChange(picked.filter((x) => x !== i.id))}>×</button>
        </span>
      ))}
      {items.length === 0 ? (
        nothingHint ? <div className="hint chiphint">{nothingHint}</div> : empty && <span className="npill off">{empty}</span>
      ) : (
        <>
          {added.length === 0 && empty && <span className="npill off">{empty}</span>}
          {left.length > 0 && <button type="button" className="npill add" aria-expanded={open} onClick={() => setOpen((v) => !v)}>+ {label}</button>}
        </>
      )}
      {open && left.length > 0 && (
        <div className="chipadd" role="menu">
          {left.map((i) => (
            <button key={i.id} type="button" role="menuitem" onClick={() => { onChange([...picked, i.id]); if (left.length === 1) setOpen(false); }}>
              <b>{i.name}</b>{i.note && <span className="muted"> · {i.note}</span>}<span className="sub">{i.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Free-text plaques (forbidden topics): «×» removes, «+ Тема» opens a small input, Enter adds. */
export function TextChips({ values, onChange, label, placeholder }: {
  values: string[];
  onChange: (v: string[]) => void;
  label: string;
  placeholder: string;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (t && !values.includes(t)) onChange([...values, t].slice(0, 20));
    setText("");
    setAdding(false);
  };
  return (
    <div className="chips">
      {values.map((v) => (
        <span key={v} className="npill">⛔ {v}
          <button type="button" className="x" aria-label={`Убрать «${v}»`} onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
        </span>
      ))}
      {adding ? (
        <input className="chipinput" autoFocus value={text} placeholder={placeholder} maxLength={60} onChange={(e) => setText(e.target.value)} onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
            if (e.key === "Escape") { e.stopPropagation(); setText(""); setAdding(false); }
          }} />
      ) : (
        <button type="button" className="npill add" onClick={() => setAdding(true)}>+ {label}</button>
      )}
    </div>
  );
}
