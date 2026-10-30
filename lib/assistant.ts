import "server-only";
import { prisma } from "@/lib/db";
import { parseAssistant, type AssistantConfig } from "@/lib/assistant-config";

/** The user's assistant settings, cleaned against what exists now (own agents, own connectors, registry models). */
export async function loadAssistant(userId: string): Promise<AssistantConfig> {
  const [row, agents, models, conns] = await Promise.all([
    prisma.assistant.findUnique({ where: { ownerId: userId } }),
    prisma.agent.findMany({ where: { ownerId: userId }, select: { id: true } }),
    prisma.llmModel.findMany({ where: { ownerId: userId }, select: { id: true } }),
    prisma.connector.findMany({ where: { ownerId: userId }, select: { id: true } }),
  ]);
  return parseAssistant(row, { agentIds: agents.map((a) => a.id), connectorIds: conns.map((c) => c.id), modelIds: models.map((m) => m.id) });
}
