"use client";

import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/actions/auth";

export function UserMenu({
  name,
  role,
  ini,
}: {
  name: string;
  role: string;
  ini: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="row"
        style={{ background: "none", border: 0, cursor: "pointer", padding: 0, gap: 10 }}
      >
        <div style={{ textAlign: "right" }}>
          <div className="avname">{name}</div>
          <div className="avrole">{role === "ADMIN" ? "администратор" : "пользователь"}</div>
        </div>
        <span className="av">{ini}</span>
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 10px)",
            minWidth: 180,
            padding: 6,
            boxShadow: "var(--shadow-pop)",
            zIndex: 40,
          }}
        >
          <form action={logout}>
            <button
              type="submit"
              style={{
                width: "100%",
                textAlign: "left",
                border: 0,
                background: "transparent",
                fontFamily: "inherit",
                fontSize: 13.5,
                color: "var(--ink)",
                padding: "10px 11px",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Выйти
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
