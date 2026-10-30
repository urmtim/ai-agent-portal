import "server-only";
import { prisma } from "@/lib/db";
import { envModelName } from "@/lib/llm";
import { agentDesc } from "@/lib/agents/types";
import { loadAssistant } from "@/lib/assistant";

/** Plain data the chat screen needs (dates as ISO strings — they cross into the browser). */
export type ChatSummary = { id: string; title: string; pinned: boolean; archived: boolean; updatedAt: string };
export type ModelOption = { id: string; name: string };
export type AgentInfo = { id: string; name: string; desc: string };
export type ChatScreenData = {
  chats: ChatSummary[];
  models: ModelOption[];
  envModel: string | null; // used when the registry is empty
  agents: AgentInfo[];
  /** What the base assistant is set up with («Агенты» → «Ассистент»). */
  assistant: { modelName: string | null; agentNames: string[]; mail: boolean };
};

export async function loadChatScreen(userId: string): Promise<ChatScreenData> {
  const [chats, models, agents] = await Promise.all([
    prisma.chat.findMany({
      where: { ownerId: userId },
      select: { id: true, title: true, pinned: true, archived: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.llmModel.findMany({ where: { ownerId: userId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    prisma.agent.findMany({ where: { ownerId: userId }, select: { id: true, name: true, type: true } }),
  ]);
  const cfg = await loadAssistant(userId);
  return {
    chats: chats.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() })),
    models,
    envModel: models.length ? null : envModelName(),
    agents: agents.map((a) => ({ id: a.id, name: a.name, desc: agentDesc(a) })),
    assistant: {
      modelName: models.find((m) => m.id === cfg.modelId)?.name ?? null,
      agentNames: agents.filter((a) => cfg.agentIds.includes(a.id)).map((a) => a.name),
      mail: (await prisma.mcpConnection.count({ where: { ownerId: userId, kind: "mail", id: { in: cfg.mcpIds } } })) > 0,
    },
  };
}
