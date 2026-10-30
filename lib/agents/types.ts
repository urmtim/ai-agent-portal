import type { AgentType } from "@prisma/client";

/** What each agent type is, which tools (MCP) it uses and how it starts out. */
export const AGENT_TYPES: Record<AgentType, { label: string; desc: string; mcp: string[]; defaultConfig: object }> = {
  CUSTOM: {
    label: "Свой агент",
    desc: "Работает по вашей инструкции с выбранными инструментами",
    mcp: [],
    defaultConfig: {},
  },
  RECEIPTS: {
    label: "Чеки из почты",
    desc: "Читает письма → пишет в «Траты»",
    mcp: ["Почта"],
    defaultConfig: { sinceDays: 30, fromFilter: "", max: 40 },
  },
};

/** A custom agent is described by its instruction; built-in types by their fixed description. */
export function agentDesc(a: { type: AgentType; instruction?: string | null; description?: string | null }): string {
  if (a.description?.trim()) return a.description.trim();
  if (a.type === "CUSTOM") {
    const first = (a.instruction ?? "").trim().split(/\r?\n/)[0] ?? "";
    return first ? (first.length > 90 ? first.slice(0, 89) + "…" : first) : AGENT_TYPES.CUSTOM.desc;
  }
  return AGENT_TYPES[a.type].desc;
}
