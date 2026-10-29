// Journal event catalog (pure, unit-tested). Labels and colors follow the licenses portal «Журнал».

export const AUDIT_EVENTS = {
  login: { label: "вход", tone: "info" },
  login_failed: { label: "неудачный вход", tone: "err" },
  logout: { label: "выход", tone: "mut" },
  invite: { label: "приглашение", tone: "wait" },
  user: { label: "пользователь", tone: "info" },
  access: { label: "доступ", tone: "info" },
  model: { label: "модель", tone: "info" },
  agent: { label: "агент", tone: "info" },
  agent_run: { label: "запуск агента", tone: "ok" },
  agent_failed: { label: "ошибка агента", tone: "err" },
  chat: { label: "чат", tone: "mut" },
  approval: { label: "подтверждение", tone: "wait" },
  tool: { label: "инструмент", tone: "mut" },
  learning: { label: "обучение", tone: "ok" },
  mcp: { label: "MCP", tone: "info" },
} as const;

export type AuditEvent = keyof typeof AUDIT_EVENTS;

export const AUDIT_CHANNELS = ["портал", "чат", "система"] as const;
export type AuditChannel = (typeof AUDIT_CHANNELS)[number];

export const SYSTEM_ACTOR = "Система";

export function isAuditEvent(k: string): k is AuditEvent {
  return Object.prototype.hasOwnProperty.call(AUDIT_EVENTS, k);
}

/** What the journal search matches: actor, event label and details, lower-cased (Cyrillic too). */
export function searchText(actorName: string, event: AuditEvent, details: string): string {
  return `${actorName} ${AUDIT_EVENTS[event].label} ${details}`.toLowerCase();
}

/** Page numbers for the pager: first, last, current ±1, with "…" gaps. */
export function pageList(current: number, total: number): (number | "…")[] {
  const pages = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (const p of sorted) {
    const prev = out.at(-1);
    if (typeof prev === "number" && p - prev > 1) out.push("…");
    out.push(p);
  }
  return out;
}
