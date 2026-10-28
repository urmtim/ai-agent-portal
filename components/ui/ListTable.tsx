"use client";

import { useEffect, useRef, useState } from "react";
import { ICONS } from "./icons";

export type ListRow = {
  key: string;
  cells: React.ReactNode[];
  /** Text the search box matches against. */
  search: string;
  /** Values per filter id; a row without facets is never filtered out (e.g. a built-in row). */
  facets?: Record<string, string>;
  className?: string;
};

export type ListFilter = { id: string; label: string; options: string[] };

type Col = string | { label: string; align?: "right" | "center" };

/** Table card with a search box and a "+ Фильтр" checklist; filtering happens in the browser. */
export function ListTable({
  columns,
  rows,
  filters = [],
  searchPlaceholder = "Поиск по названию…",
  minWidth,
  emptyText = "Пока пусто",
}: {
  columns: Col[];
  rows: ListRow[];
  filters?: ListFilter[];
  searchPlaceholder?: string;
  minWidth?: number;
  /** Shown when there are no rows at all (as opposed to nothing matching). */
  emptyText?: string;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [open, setOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (!pop.current?.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const active = Object.values(picked).reduce((n, v) => n + v.length, 0);
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (needle && !r.search.toLowerCase().includes(needle)) return false;
    if (!r.facets) return true;
    return Object.entries(picked).every(([id, vals]) => !vals.length || vals.includes(r.facets![id]));
  });

  function toggle(id: string, v: string) {
    setPicked((p) => {
      const cur = p[id] ?? [];
      return { ...p, [id]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });
  }

  return (
    <>
      <div className="tbar">
        <label className="search">
          <span className="sr">Поиск</span>
          {ICONS.search}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} />
        </label>
        {filters.length > 0 && (
          <div className="fwrap" ref={pop}>
            <button type="button" className={active ? "btn dashed on" : "btn dashed"} aria-expanded={open}
              onClick={() => setOpen((v) => !v)}>
              {active ? `Фильтр · ${active}` : "+ Фильтр"}
            </button>
            {open && (
              <div className="fpop" role="dialog" aria-label="Фильтр">
                {filters.map((f) => (
                  <div className="fgroup" key={f.id}>
                    <div className="flabel">{f.label}</div>
                    {f.options.map((o) => (
                      <label className="toggle" key={o}>
                        <input type="checkbox" checked={(picked[f.id] ?? []).includes(o)} onChange={() => toggle(f.id, o)} />
                        <span>{o}</span>
                      </label>
                    ))}
                  </div>
                ))}
                {active > 0 && (
                  <button type="button" className="btn ghost sm" onClick={() => setPicked({})}>Сбросить</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card tcard">
        <table style={minWidth ? { minWidth } : undefined}>
          <thead>
            <tr>
              {columns.map((c, i) => {
                const col = typeof c === "string" ? { label: c } : c;
                return <th key={i} style={col.align ? { textAlign: col.align } : undefined}>{col.label}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className={r.className}>
                {r.cells.map((cell, i) => <td key={i} className={i === r.cells.length - 1 ? "acts" : undefined}>{cell}</td>)}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={columns.length} className="muted" style={{ textAlign: "center", padding: 28 }}>{rows.length ? "Ничего не найдено" : emptyText}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
