"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import { ICONS, IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { ensureChatTitle } from "./actions";
import { AssistantParts, messageText } from "./ChatParts";
import type { AgentInfo, ChatScreenData, ModelOption } from "./data";

/** Empty-chat suggestions: only what the base assistant is allowed to do. */
function suggestions(a: ChatScreenData["assistant"]): string[] {
  const out = [
    ...(a.mail ? ["Что важного пришло за сегодня?", "Есть непрочитанные письма?"] : []),
    ...a.agentNames.slice(0, 2).map((n) => `Запусти агента «${n}»`),
  ];
  return out.length ? out : ["Что ты умеешь?", "Помоги составить план на неделю"];
}

export function ChatThread({ chatId, title, initialMessages, models, envModel, agents, assistant, histHidden, onToggleHist, onSaved }: {
  chatId: string;
  title: string;
  initialMessages: UIMessage[];
  models: ModelOption[];
  envModel: string | null;
  agents: AgentInfo[];
  assistant: ChatScreenData["assistant"];
  histHidden: boolean;
  onToggleHist: () => void;
  onSaved: (chatId: string, title: string) => void;
}) {
  const toast = useToast();
  const [transport] = useState(() => new DefaultChatTransport({ api: "/api/chat" }));
  const { messages, sendMessage, status, stop, regenerate, error, addToolApprovalResponse } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    // the server tells whether the chat now exists (and its title)
    onFinish: () => { ensureChatTitle(chatId).then((t) => { if (t) onSaved(chatId, t); }, () => {}); },
  });

  const [input, setInput] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const busy = status === "submitted" || status === "streaming";
  const noModel = !models.length && !envModel;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  // keep the newest content in view unless the user scrolled up
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, status, error]);

  function autosize() {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function send(text: string) {
    if (!text.trim() || busy || noModel) return;
    stick.current = true;
    sendMessage({ text: text.trim() });
    setInput("");
    requestAnimationFrame(autosize);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast("Скопировано"), () => toast("Не удалось скопировать"));
  }

  function saveEdit() {
    if (!editing || !editing.text.trim()) return;
    stick.current = true;
    sendMessage({ text: editing.text.trim(), messageId: editing.id }); // replaces it and drops what followed
    setEditing(null);
  }


  return (
    <section className="cmain">
      <div className="ctop">
        <button type="button" className="ibtn histbtn" onClick={onToggleHist}
          title={histHidden ? "Показать историю" : "Скрыть историю"} aria-label={histHidden ? "Показать историю" : "Скрыть историю"}>
          {ICONS.list}
        </button>
        <span className="ctitle">{title || "Новый чат"}</span>
      </div>

      <div className="cscroll" ref={scroller}
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {messages.length === 0 ? (
          <div className="cempty">
            <h2>Чем помочь?</h2>
            <p className="muted">
              Спросите что угодно.{" "}
              {assistant.agentNames.length || assistant.mail
                ? <>{assistant.mail && "Разберу почту по вашей просьбе. "}{assistant.agentNames.length > 0 && "Агента запущу с вашего подтверждения."}</>
                : <>Агентов можно разрешить в <Link href="/agents" className="link">«Агенты» → «Ассистент»</Link>, почту — подключить в разделе MCP.</>}
            </p>
            <div className="row" style={{ flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {suggestions(assistant).map((s) => (
                <button key={s} type="button" className="btn ghost sm" style={{ borderRadius: 20 }} disabled={noModel} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="cthread">
            {messages.map((m) => {
              const text = messageText(m);
              if (m.role === "user") {
                if (editing?.id === m.id) {
                  return (
                    <div className="cmsg u" key={m.id}>
                      <div className="cedit">
                        <textarea aria-label="Изменить сообщение" value={editing.text} autoFocus
                          onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); saveEdit(); }
                            if (e.key === "Escape") setEditing(null);
                          }} />
                        <div className="wrap-gap">
                          <button type="button" className="btn ghost sm" onClick={() => setEditing(null)}>Отмена</button>
                          <button type="button" className="btn primary sm" onClick={saveEdit}>Отправить</button>
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="cmsg u" key={m.id}>
                    <div className="cub">{text}</div>
                    <div className="macts">
                      <IconButton icon="copy" title="Копировать" onClick={() => copy(text)} />
                      <IconButton icon="edit" title="Изменить" disabled={busy} onClick={() => setEditing({ id: m.id, text })} />
                    </div>
                  </div>
                );
              }
              const isLast = m.id === lastAssistant?.id;
              return (
                <div className={`cmsg${isLast ? " last" : ""}`} key={m.id}>
                  <AssistantParts message={m} agents={agents} canApprove={!busy}
                    onApprove={(id, approved) => { stick.current = true; addToolApprovalResponse({ id, approved }); }} />
                  {text && !(isLast && busy) && (
                    <div className="macts">
                      <IconButton icon="copy" title="Копировать" onClick={() => copy(text)} />
                      {isLast && <IconButton icon="retry" title="Повторить" disabled={busy} onClick={() => regenerate()} />}
                    </div>
                  )}
                </div>
              );
            })}
            {status === "submitted" && <div className="ctyping" aria-label="Ассистент печатает"><i /><i /><i /></div>}
            {error && (
              <div className="cmsg">
                <div className="ca err" role="alert">{error.message || "Не удалось получить ответ"}</div>
                <div className="macts" style={{ opacity: 1 }}>
                  <button type="button" className="btn ghost sm" onClick={() => regenerate()}>Повторить</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="cbox">
        {noModel && (
          <div className="callout warn cwarn">
            <span className="ic">⚠️</span>
            <div style={{ fontSize: 13.5 }}>Чтобы чат отвечал, добавьте модель в разделе <Link href="/models" className="b link">«Модели»</Link>.</div>
          </div>
        )}
        <div className="ccomp">
          <textarea ref={ta} rows={1} placeholder="Напишите сообщение…" aria-label="Сообщение" value={input} disabled={noModel}
            onChange={(e) => { setInput(e.target.value); autosize(); }} onKeyDown={onKeyDown} />
          {busy ? (
            <button type="button" className="csend stop" title="Остановить" aria-label="Остановить" onClick={() => stop()}>{ICONS.stop}</button>
          ) : (
            <button type="button" className="csend" title="Отправить" aria-label="Отправить" disabled={noModel || !input.trim()} onClick={() => send(input)}>{ICONS.up}</button>
          )}
        </div>
        <div className="chint">Enter — отправить, Shift+Enter — новая строка. Агентов ассистент запускает только с вашего подтверждения.</div>
      </div>
    </section>
  );
}
