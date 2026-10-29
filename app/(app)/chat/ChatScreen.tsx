"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { useToast } from "@/components/ui/Toast";
import { archiveChat, deleteChat, pinChat } from "./actions";
import { ChatHistory } from "./ChatHistory";
import { ChatThread } from "./ChatThread";
import type { ChatScreenData } from "./data";

/** The chat page from the mockup: history on the left, the thread on the right. */
export function ChatScreen({ chats: initialChats, models, envModel, agents, assistant, chatId, saved, title: initialTitle, initialMessages, initialModelId }:
  ChatScreenData & { chatId: string; saved: boolean; title: string; initialMessages: UIMessage[]; initialModelId: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [chats, setChats] = useState(initialChats);
  const [title, setTitle] = useState(initialTitle);
  const [histOpen, setHistOpen] = useState(false); // narrow screens: overlay
  const [histHidden, setHistHidden] = useState(false); // wide screens: collapsed
  const savedRef = useRef(saved);
  const wrap = useRef<HTMLDivElement>(null);

  // the chat box fills the window below the header, like in the mockup
  useEffect(() => {
    const fit = () => {
      const el = wrap.current;
      if (el) el.style.height = `${Math.max(420, window.innerHeight - el.getBoundingClientRect().top - 20)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  function onSaved(id: string, t: string) {
    if (!savedRef.current) {
      savedRef.current = true;
      window.history.replaceState(null, "", `/chat/${id}`);
    }
    setTitle(t);
    setChats((cs) => {
      const old = cs.find((c) => c.id === id);
      return [{ id, pinned: false, archived: false, ...old, title: t, updatedAt: new Date().toISOString() }, ...cs.filter((c) => c.id !== id)];
    });
  }

  function patch(id: string, p: { pinned?: boolean; archived?: boolean }) {
    setChats((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }

  return (
    <div className={`cwrap${histHidden ? " nohist" : ""}`} ref={wrap}>
      <ChatHistory chats={chats} currentId={chatId} open={histOpen}
        onNavigate={() => setHistOpen(false)}
        onPin={(id, pinned) => { patch(id, { pinned }); pinChat(id, pinned).then(() => toast(pinned ? "Чат закреплён" : "Чат откреплён")); }}
        onArchive={(id, archived) => { patch(id, { archived }); archiveChat(id, archived).then(() => toast(archived ? "Чат в архиве" : "Чат возвращён из архива")); }}
        onDelete={async (id) => {
          await deleteChat(id);
          setChats((cs) => cs.filter((c) => c.id !== id));
          toast("Чат удалён");
          if (id === chatId) router.push("/chat");
        }} />
      <ChatThread chatId={chatId} title={title} initialMessages={initialMessages} initialModelId={initialModelId}
        models={models} envModel={envModel} agents={agents} assistant={assistant} histHidden={histHidden} onSaved={onSaved}
        onToggleHist={() => {
          if (window.matchMedia("(max-width: 760px)").matches) setHistOpen((o) => !o);
          else setHistHidden((h) => !h);
        }} />
    </div>
  );
}
