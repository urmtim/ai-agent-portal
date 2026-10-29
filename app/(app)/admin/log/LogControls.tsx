"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ICONS } from "@/components/ui/icons";
import { AUDIT_CHANNELS, AUDIT_EVENTS, type AuditEvent } from "@/lib/audit-events";

/** Search + «+ Фильтр» for the journal; both live in the URL so the server filters and pages. */
export function LogControls({ q: initialQ, events, channels }: { q: string; events: string[]; channels: string[] }) {
  const router = useRouter();
  const path = usePathname();
  const [q, setQ] = useState(initialQ);
  const [open, setOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  const active = events.length + channels.length;

  function go(next: { q?: string; events?: string[]; channels?: string[] }) {
    const u = new URLSearchParams();
    const qq = (next.q ?? q).trim();
    if (qq) u.set("q", qq);
    (next.events ?? events).forEach((e) => u.append("ev", e));
    (next.channels ?? channels).forEach((c) => u.append("ch", c));
    const s = u.toString();
    router.replace(s ? `${path}?${s}` : path); // a new search or filter starts from page 1
  }

  // search as you type, without a request per key
  const latest = useRef(go);
  useEffect(() => { latest.current = go; });
  useEffect(() => {
    if (q.trim() === initialQ) return;
    const t = setTimeout(() => latest.current({ q }), 300);
    return () => clearTimeout(t);
  }, [q, initialQ]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const flip = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="tbar">
      <label className="search">
        <span className="sr">Поиск</span>
        {ICONS.search}
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по пользователю или событию…" />
      </label>
      <div className="fwrap" ref={pop}>
        <button type="button" className={active ? "btn dashed on" : "btn dashed"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {active ? `Фильтр · ${active}` : "+ Фильтр"}
        </button>
        {open && (
          <div className="fpop" role="dialog" aria-label="Фильтр">
            <div className="fgroup">
              <div className="flabel">Событие</div>
              {(Object.keys(AUDIT_EVENTS) as AuditEvent[]).map((k) => (
                <label className="toggle" key={k}>
                  <input type="checkbox" checked={events.includes(k)} onChange={() => go({ events: flip(events, k) })} />
                  <span>{AUDIT_EVENTS[k].label}</span>
                </label>
              ))}
            </div>
            <div className="fgroup">
              <div className="flabel">Канал</div>
              {AUDIT_CHANNELS.map((c) => (
                <label className="toggle" key={c}>
                  <input type="checkbox" checked={channels.includes(c)} onChange={() => go({ channels: flip(channels, c) })} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
            {active > 0 && <button type="button" className="btn ghost sm" onClick={() => go({ events: [], channels: [] })}>Сбросить</button>}
          </div>
        )}
      </div>
    </div>
  );
}
