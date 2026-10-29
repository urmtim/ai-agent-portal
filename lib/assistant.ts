import "server-only";
import { prisma } from "@/lib/db";
import { parseAssistant, type AssistantConfig } from "@/lib/assistant-config";

/** The user's base assistant settings, cleaned against what exists now (no MCP servers yet). */
export async function loadAssistant(userId: string): Promise<AssistantConfig> {
  const [row, agents, models] = await Promise.all([
    prisma.assistant.findUnique({ where: { ownerId: userId } }),
    prisma.agent.findMany({ where: { ownerId: userId }, select: { id: true } }),
    prisma.llmModel.findMany({ select: { id: true } }),
  ]);
  return parseAssistant(row, { agentIds: agents.map((a) => a.id), mcpIds: [], modelIds: models.map((m) => m.id) });
}
