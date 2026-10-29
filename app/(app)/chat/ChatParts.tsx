"use client";

import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UIMessage } from "ai";
import type { RunAgentResult, SpendingResult } from "@/lib/chat/tools";
import type { AgentInfo } from "./data";

// How one assistant message looks: Markdown text, a line per tool call (mockup .cstep)
// and the confirmation card before an agent runs (mockup .hitl).

type ToolPart = {
  type: string;
  toolCallId: string;
  state: string;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
  approval?: { id: string; approved?: boolean; isAutomatic?: boolean };
};

const rub = (n: number) => `${new Intl.NumberFormat("ru-RU").format(n)} ₽`;

export function messageText(m: UIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).filter(Boolean).join("\n\n").trim();
}

function Step({ summary, fail, details, running }: { summary: React.ReactNode; fail?: string; details?: string; running?: boolean }) {
  return (
    <details className="cstep">
      <summary>
        {running && <span className="spin" />}
        <span>{summary}</span>
        {fail && <span className="cfail">{fail}</span>}
        {details && <span className="chev">▸</span>}
      </summary>
      {details && <pre>{details}</pre>}
    </details>
  );
}

function SpendingStep({ part }: { part: ToolPart }) {
  if (part.state === "output-error") return <Step summary="Траты" fail="Ошибка" details={part.errorText} />;
  if (part.state !== "output-available") return <Step running summary="Смотрю траты…" />;
  const o = part.output as SpendingResult;
  const details = [
    ...o.categories.map((c) => `${c.category} — ${rub(c.total)}`),
    ...(o.topMerchants.length ? ["", "Крупнейшие магазины:", ...o.topMerchants.map((m) => `${m.merchant} — ${rub(m.total)}`)] : []),
  ].join("\n");
  return <Step summary={<>Траты за {o.days} дн. · <b>{rub(o.total)}</b>, чеков: {o.count}</>} details={details || "Чеков за этот период нет"} />;
}

function AgentStep({ part, agents, onApprove, canApprove }: {
  part: ToolPart; agents: AgentInfo[]; canApprove: boolean; onApprove: (id: string, approved: boolean) => void;
}) {
  const agent = agents.find((a) => a.id === part.input?.agentId);
  const out = part.output as RunAgentResult | undefined;
  const name = agent?.name ?? (out && "agent" in out ? out.agent : "агент");

  switch (part.state) {
    case "approval-requested":
      if (part.approval?.isAutomatic) return null;
      return (
        <div className="hitl">
          <div className="ht">⏸ Нужно подтверждение · Запустить агента</div>
          <div className="hd">«{name}»{agent ? ` — ${agent.desc}` : ""}</div>
          <div className="wrap-gap">
            <button type="button" className="btn primary sm" disabled={!canApprove} onClick={() => onApprove(part.approval!.id, true)}>Запустить</button>
            <button type="button" className="btn ghost sm" disabled={!canApprove} onClick={() => onApprove(part.approval!.id, false)}>Отмена</button>
          </div>
        </div>
      );
    case "approval-responded":
      return part.approval?.approved
        ? <Step running summary={<>Агент <b>«{name}»</b> выполняется…</>} />
        : <Step summary={<>Запуск агента <b>«{name}»</b> отменён</>} />;
    case "output-denied":
      return <Step summary={<>Запуск агента <b>«{name}»</b> отменён</>} />;
    case "output-error":
      return <Step summary={<>Агент <b>«{name}»</b></>} fail="Ошибка" details={part.errorText} />;
    case "output-available": {
      if (!out || "error" in out) return <Step summary="Запуск агента" fail={out?.error ?? "Ошибка"} />;
      const failed = out.status === "error";
      return (
        <>
          <Step summary={<>Агент <b>«{out.agent}»</b> · {out.summary}</>} fail={failed ? "Ошибка" : undefined} details={out.log || out.summary} />
          {!failed && out.created > 0 && (
            <div className="cacts"><Link href="/stats" className="btn ghost sm">Открыть «Траты»</Link></div>
          )}
        </>
      );
    }
    default:
      return <Step running summary={<>Готовлю запуск агента <b>«{name}»</b>…</>} />;
  }
}

export function AssistantParts({ message, agents, canApprove, onApprove }: {
  message: UIMessage; agents: AgentInfo[]; canApprove: boolean; onApprove: (id: string, approved: boolean) => void;
}) {
  return message.parts.map((p, i) => {
    if (p.type === "text") {
      return p.text.trim() ? <div className="ca" key={i}><Markdown remarkPlugins={[remarkGfm]}>{p.text}</Markdown></div> : null;
    }
    if (p.type === "tool-get_spending") return <SpendingStep key={i} part={p as ToolPart} />;
    if (p.type === "tool-run_agent") {
      return <AgentStep key={i} part={p as ToolPart} agents={agents} canApprove={canApprove} onApprove={onApprove} />;
    }
    return null; // step-start, reasoning, sources — not shown
  });
}
