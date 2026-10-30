import "server-only";
import { prisma } from "@/lib/db";

/** Who works on each of the owner's models: «Ассистент» first, then agents by name. */
export async function modelUsers(ownerId: string): Promise<Map<string, string[]>> {
  const [a, agents] = await Promise.all([
    prisma.assistant.findUnique({ where: { ownerId }, select: { modelId: true } }),
    prisma.agent.findMany({ where: { ownerId, modelId: { not: null } }, orderBy: { createdAt: "asc" }, select: { name: true, modelId: true } }),
  ]);
  const used = new Map<string, string[]>();
  const add = (id: string, who: string) => used.set(id, [...(used.get(id) ?? []), who]);
  if (a?.modelId) add(a.modelId, "Ассистент");
  for (const x of agents) if (x.modelId) add(x.modelId, x.name);
  return used;
}
