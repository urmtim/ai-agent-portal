"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/ui/Modal";
import { ICONS } from "@/components/ui/icons";
import { groupChats } from "@/lib/chat/history";
import type { ChatSummary } from "./data";

export function ChatHistory({ chats, currentId, open, onNavigate, onPin, onArchive, onDelete }: {
  chats: ChatSummary[];
  currentId: string;
  open: boolean;
  onNavigate: () => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // close the ⋯ menu on an outside click or Esc
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (!(e.target as Element).closest?.(`[data-chat="${menu}"]`)) setMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  const query = q.trim().toLowerCase();
  const groups = groupChats(chats.map((c) => ({ ...c, updatedAt: new Date(c.updatedAt) })), new Date())
    .map((g) => ({ ...g, chats: g.chats.filter((c) => !query || (c.title || "Новый чат").toLowerCase().includes(query)) }))
    .filter((g) => g.chats.length > 0);

  function act(fn: () => void) { setMenu(null); fn(); }

  return (
    <aside className={`hist${open ? " open" : ""}`}>
      <Link href="/chat" className="btn ghost block" onClick={onNavigate}>+ Новый чат</Link>
      <label className="search">
        <span className="sr">Поиск по чатам</span>{ICONS.search}
        <input type="search" placeholder="Поиск по чатам…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      {groups.map((g) => {
        const isCollapsed = !query && (collapsed[g.key] ?? !!g.collapsed);
        return (
          <div className="hgroup" key={g.key}>
            <button type="button" className="hhead" aria-expanded={!isCollapsed}
              onClick={() => setCollapsed((s) => ({ ...s, [g.key]: !isCollapsed }))}>
              {g.label}<span className="chev">▾</span>
            </button>
            <div className="hitems">
              {g.chats.map((c) => (
                <div className="hrow" key={c.id} data-chat={c.id}>
                  <Link href={`/chat/${c.id}`} className={`hitem${c.id === currentId ? " on" : ""}`} onClick={onNavigate}
                    aria-current={c.id === currentId ? "page" : undefined}>
                    {c.title || "Новый чат"}
                  </Link>
                  <button type="button" className="ibtn hmore" title="Действия с чатом" aria-label="Действия с чатом"
                    aria-haspopup="menu" aria-expanded={menu === c.id} onClick={() => setMenu(menu === c.id ? null : c.id)}>
                    {ICONS.more}
                  </button>
                  {menu === c.id && (
                    <div className="hpop" role="menu">
                      <button type="button" role="menuitem" onClick={() => act(() => onPin(c.id, !c.pinned))}>
                        {c.pinned ? "Открепить" : "Закрепить"}
                      </button>
                      <button type="button" role="menuitem" onClick={() => act(() => onArchive(c.id, !c.archived))}>
                        {c.archived ? "Вернуть из архива" : "В архив"}
                      </button>
                      <button type="button" role="menuitem" className="del" onClick={() => act(() => setToDelete({ id: c.id, title: c.title }))}>Удалить</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {chats.length === 0 && <div className="hempty">Здесь появятся ваши чаты.</div>}
      {chats.length > 0 && groups.length === 0 && <div className="hempty">Ничего не найдено.</div>}

      <ConfirmModal open={!!toDelete} onClose={() => setToDelete(null)} title="Удалить чат?" pending={deleting}
        text={<>«{toDelete?.title || "Новый чат"}» и вся переписка в нём будут удалены.</>}
        onConfirm={async () => {
          setDeleting(true);
          await onDelete(toDelete!.id);
          setDeleting(false);
          setToDelete(null);
        }} />
    </aside>
  );
}
