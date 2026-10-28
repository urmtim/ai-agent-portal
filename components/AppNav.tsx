"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  NAV,
  NAV_GROUPS,
  PINS_STORAGE_KEY,
  movePin,
  navKeyForPath,
  parsePins,
  unpin,
  visiblePins,
  type NavKey,
} from "@/lib/nav";

// ---- pins live in localStorage; useSyncExternalStore keeps SSR and the first client render in sync ----
const PINS_EVENT = "portal:nav-pins";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(PINS_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(PINS_EVENT, cb);
  };
}
function readRaw(): string | null {
  try { return localStorage.getItem(PINS_STORAGE_KEY); } catch { return null; }
}
function savePins(pins: NavKey[]) {
  try { localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(pins)); } catch {}
  window.dispatchEvent(new Event(PINS_EVENT));
}

const DOTS = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
    {[3, 9, 15].flatMap((y) => [3, 9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" />))}
  </svg>
);
const PIN = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 17v5" /><path d="M9 3h6l-1 6 4 4v2H6v-2l4-4z" />
  </svg>
);

type Ins = { key: NavKey; side: "l" | "r" } | null;

export function AppNav({ isAdmin, right }: { isAdmin: boolean; right: React.ReactNode }) {
  const pathname = usePathname();
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const allPins = parsePins(raw);
  const pins = visiblePins(allPins, isAdmin);
  const cur = navKeyForPath(pathname);
  const temp = cur && !pins.includes(cur) && (isAdmin || !NAV[cur].adminOnly) ? cur : undefined;

  const [open, setOpen] = useState(false);
  const [ins, setIns] = useState<Ins>(null);
  const [navDrop, setNavDrop] = useState(false);
  const [trayDrop, setTrayDrop] = useState(false);
  const [dragging, setDragging] = useState<NavKey | null>(null);
  const drag = useRef<{ key: NavKey; from: "nav" | "tray" } | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // where a drop at clientX lands among the pinned items (the dragged one excluded)
  function dropSlot(x: number) {
    const els = [...(navRef.current?.querySelectorAll<HTMLElement>("[data-pinned]") ?? [])]
      .filter((el) => el.dataset.key !== drag.current?.key);
    const idx = els.filter((el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2 < x; }).length;
    return { keys: els.map((el) => el.dataset.key as NavKey), idx };
  }

  function startDrag(e: React.DragEvent, key: NavKey, from: "nav" | "tray") {
    drag.current = { key, from };
    setDragging(key);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", key);
  }
  function endDrag() {
    drag.current = null;
    setDragging(null); setIns(null); setNavDrop(false); setTrayDrop(false);
  }

  function onNavOver(e: React.DragEvent) {
    if (!drag.current) return;
    e.preventDefault();
    setNavDrop(true);
    const { keys, idx } = dropSlot(e.clientX);
    if (idx < keys.length) setIns({ key: keys[idx], side: "l" });
    else if (keys.length) setIns({ key: keys[keys.length - 1], side: "r" });
    else setIns(null);
  }
  function onNavDrop(e: React.DragEvent) {
    e.preventDefault();
    const d = drag.current;
    if (d) {
      const { keys, idx } = dropSlot(e.clientX);
      // hidden admin pins keep their place at the end of the stored list
      const hidden = allPins.filter((k) => !pins.includes(k) && k !== d.key);
      savePins([...movePin(keys, d.key, idx), ...hidden]);
    }
    endDrag();
  }
  function onTrayDrop(e: React.DragEvent) {
    e.preventDefault();
    const d = drag.current;
    if (d?.from === "nav" && pins.length > 1) savePins(unpin(allPins, d.key));
    endDrag();
  }

  function pin(key: NavKey) { savePins([...allPins.filter((k) => k !== key), key]); }

  function cls(...names: (string | false | undefined)[]) { return names.filter(Boolean).join(" ") || undefined; }

  return (
    <header className="hd">
      <div className="hdin">
        <div className="hmid">
          <button type="button" className={cls("lbtn", open && "on")} title="Все разделы" aria-label="Все разделы"
            aria-expanded={open} aria-controls="tray" onClick={() => setOpen((v) => !v)}>
            {DOTS}
          </button>

          <nav ref={navRef} className={cls("menu", navDrop && "drop")} aria-label="Разделы"
            onDragOver={onNavOver} onDrop={onNavDrop}
            onDragLeave={(e) => { if (!navRef.current?.contains(e.relatedTarget as Node)) { setNavDrop(false); setIns(null); } }}>
            {pins.map((k) => (
              <Link key={k} href={NAV[k].href} data-key={k} data-pinned="" draggable
                className={cls(k === cur && "on", dragging === k && "dragging", ins?.key === k && `ins-${ins.side}`)}
                onDragStart={(e) => startDrag(e, k, "nav")} onDragEnd={endDrag}>
                {NAV[k].label}
              </Link>
            ))}
            {temp && (
              <span className="temp on" title="Раздел не закреплён в меню">
                <Link href={NAV[temp].href} data-key={temp} aria-current="page">{NAV[temp].label}</Link>
                <button type="button" className="pin" title="Закрепить в меню" aria-label="Закрепить в меню"
                  onClick={() => pin(temp)}>
                  {PIN}
                </button>
              </span>
            )}
          </nav>
        </div>
        <div className="right">{right}</div>
      </div>

      <div className={cls("tray", open && "open")} id="tray" inert={!open}>
        <div className="trayclip">
          <div className={cls("trayin", trayDrop && "drop")}
            onDragOver={(e) => { if (drag.current?.from === "nav") { e.preventDefault(); setTrayDrop(true); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setTrayDrop(false); }}
            onDrop={onTrayDrop}>
            <div className="tgroups">
              {NAV_GROUPS.filter((g) => isAdmin || !g.adminOnly).map((g) => (
                <div className="tg" key={g.title}>
                  <div className="lgroup">
                    {g.title}{g.note && <> <span className="note">{g.note}</span></>}
                  </div>
                  {g.items.map((k) => (
                    <Link key={k} href={NAV[k].href} draggable data-key={k}
                      className={cls("titem", g.dim && "dim", k === cur && "cur", dragging === k && "dragging")}
                      onClick={() => setOpen(false)}
                      onKeyDown={(e) => { if (e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
                      onDragStart={(e) => startDrag(e, k, "tray")} onDragEnd={endDrag}>
                      {NAV[k].label}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
