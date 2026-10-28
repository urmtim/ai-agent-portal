import type { AgentType } from "@prisma/client";

/** What each agent type is, which tools (MCP) it uses and how it starts out. */
export const AGENT_TYPES: Record<AgentType, { label: string; desc: string; mcp: string[]; defaultConfig: object }> = {
  RECEIPTS: {
    label: "Чеки из почты",
    desc: "Читает письма → пишет в «Траты»",
    mcp: ["Почта"],
    defaultConfig: { sinceDays: 30, fromFilter: "", max: 40 },
  },
};
