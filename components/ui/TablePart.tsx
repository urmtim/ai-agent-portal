"use client";

import { useEffect, useRef, useState } from "react";
import { ICONS, IconButton } from "./icons";

export type PartItem = { id: string; name: string; desc: string; note?: string; facet?: string };

/** A per-row choice shown as its own column (e.g. «Доступ» of an MCP connection). */
export type PartColumn = {
  label: string;
  options: { value: string; label: string }[];
  value: (id: string) => string;
  onChange: (id: string, value: string) => void;
};

/** Close a popover on an outside click. */
export function useOutside(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, ref, close]);
}

/**
 * «Табличная часть» (1C-style) inside a form: what was added, with search, «+ Фильтр» and «Добавить» right above
 * the table and «Убрать» per row. The parent keeps `picked` and renders the hidden inputs.
 */
export function TablePart({ items, picked, onChange, nothingHint, filter, column }: {
  items: PartItem[];
  picked: string[];
  onChange: (ids: string[]) => void;
  /** Shown when there is nothing that could ever be added (optional: the empty table and the disabled «Добавить» say it too). */
  nothingHint?: React.ReactNode;
  /** Facet to filter the added rows by (e.g. включён / выключен). */
  filter?: { label: string; options: string[] };
  column?: PartColumn;
}) {
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [fOpen, setFOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const fRef = useRef<HTMLDivElement>(null);
  const aRef = useRef<HTMLDivElement>(null);
  useOutside(fOpen, fRef, () => setFOpen(false));
  useOutside(addOpen, aRef, () => setAddOpen(false));

  const added = picked.map((id) => items.find((i) => i.id === id)).filter((i): i is PartItem => !!i);
  const needle = q.trim().toLowerCase();
  const rows = added.filter((i) => (!needle || `${i.name} ${i.desc}`.toLowerCase().includes(needle)) && (!chosen.length || chosen.includes(i.facet ?? "")));
  const left = items.filter((i) => !picked.includes(i.id));

  return (
    <div className="tpartwrap">
      <div className="tbar">
        <label className="search">
          <span className="sr">Поиск</span>{ICONS.search}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск…" />
        </label>
        {filter && (
          <div className="fwrap" ref={fRef}>
            <button type="button" className={chosen.length ? "btn dashed on" : "btn dashed"} aria-expanded={fOpen} onClick={() => setFOpen((v) => !v)}>
              {chosen.length ? `Фильтр · ${chosen.length}` : "+ Фильтр"}
            </button>
            {fOpen && (
              <div className="fpop" role="dialog" aria-label="Фильтр">
                <div className="fgroup">
                  <div className="flabel">{filter.label}</div>
                  {filter.options.map((o) => (
                    <label className="toggle" key={o}>
                      <input type="checkbox" checked={chosen.includes(o)} onChange={() => setChosen((c) => (c.includes(o) ? c.filter((x) => x !== o) : [...c, o]))} />
                      <span>{o}</span>
                    </label>
                  ))}
                </div>
                {chosen.length > 0 && <button type="button" className="btn ghost sm" onClick={() => setChosen([])}>Сбросить</button>}
              </div>
            )}
          </div>
        )}
        <div className="fwrap spacer" ref={aRef}>
          <button type="button" className="btn primary" disabled={left.length === 0} aria-expanded={addOpen}
            title={left.length === 0 ? (items.length ? "Всё уже добавлено" : "Добавить нечего") : undefined}
            onClick={() => setAddOpen((v) => !v)}>Добавить</button>
          {addOpen && (
            <div className="fpop addpop" role="menu">
              {left.map((i) => (
                <button key={i.id} type="button" role="menuitem" onClick={() => { onChange([...picked, i.id]); setAddOpen(false); }}>
                  <b>{i.name}</b>{i.note && <span className="muted"> · {i.note}</span>}<span className="sub">{i.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="tpart">
        <table>
          <thead><tr><th>Название</th><th>Описание</th>{column && <th>{column.label}</th>}<th /></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={column ? 4 : 3} className="muted tempty">{added.length ? "Ничего не найдено" : "Пока ничего не добавлено"}</td></tr>
            ) : rows.map((i) => (
              <tr key={i.id}>
                <td><b>{i.name}</b>{i.note && <span className="muted"> · {i.note}</span>}</td>
                <td className="muted">{i.desc}</td>
                {column && (
                  <td>
                    <select className="sm" aria-label={`${column.label}: ${i.name}`} value={column.value(i.id)} onChange={(e) => column.onChange(i.id, e.target.value)}>
                      {column.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                )}
                <td className="acts"><IconButton icon="del" title="Убрать" onClick={() => onChange(picked.filter((x) => x !== i.id))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length === 0 && nothingHint && <div className="hint">{nothingHint}</div>}
    </div>
  );
}

/** Tabs inside a modal form; panels stay mounted (hidden), so every field is submitted. */
export function FormTabs<K extends string>({ tabs, active, onChange }: {
  tabs: { key: K; label: string; count?: number }[];
  active: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="mtabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={active === t.key} className={active === t.key ? "on" : undefined} onClick={() => onChange(t.key)}>
          {t.label}{t.count !== undefined && <> <span className="n">{t.count}</span></>}
        </button>
      ))}
    </div>
  );
}
