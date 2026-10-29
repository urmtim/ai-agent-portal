import "server-only";
import { prisma } from "@/lib/db";
import { envModelName } from "@/lib/llm";
import { AGENT_TYPES } from "@/lib/agents/types";
import { loadAssistant } from "@/lib/assistant";

/** Plain data the chat screen needs (dates as ISO strings — they cross into the browser). */
export type ChatSummary = { id: string; title: string; pinned: boolean; archived: boolean; updatedAt: string };
export type ModelOption = { id: string; name: string; isDefault: boolean };
export type AgentInfo = { id: string; name: string; desc: string };
export type ChatScreenData = {
  chats: ChatSummary[];
  models: ModelOption[];
  envModel: string | null; // used when the registry is empty
  agents: AgentInfo[];
  /** What the base assistant is set up with («Агенты» → «Базовый ассистент»). */
  assistant: { modelName: string | null; spending: boolean; agentNames: string[] };
};

export async function loadChatScreen(userId: string): Promise<ChatScreenData> {
  const [chats, models, agents] = await Promise.all([
    prisma.chat.findMany({
      where: { ownerId: userId },
      select: { id: true, title: true, pinned: true, archived: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.llmModel.findMany({ select: { id: true, name: true, isDefault: true }, orderBy: { createdAt: "asc" } }),
    prisma.agent.findMany({ where: { ownerId: userId }, select: { id: true, name: true, type: true } }),
  ]);
  const cfg = await loadAssistant(userId);
  return {
    chats: chats.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() })),
    models,
    envModel: models.length ? null : envModelName(),
    agents: agents.map((a) => ({ id: a.id, name: a.name, desc: AGENT_TYPES[a.type].desc })),
    assistant: {
      modelName: models.find((m) => m.id === cfg.modelId)?.name ?? null,
      spending: cfg.apis.includes("spending"),
      agentNames: agents.filter((a) => cfg.agentIds.includes(a.id)).map((a) => a.name),
    },
  };
}
