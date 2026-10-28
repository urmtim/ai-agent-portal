"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { runAgent } from "@/lib/agents/runner";

async function ownAgentOrThrow(agentId: string, userId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.ownerId !== userId) throw new Error("Агент не найден");
  return agent;
}

/** Create the receipts agent for the current user (one-click). */
export async function createReceiptsAgent(): Promise<void> {
  const user = await requireUser();
  await prisma.agent.create({
    data: {
      ownerId: user.id,
      type: "RECEIPTS",
      name: "Чеки из почты",
      config: JSON.stringify({ sinceDays: 30, fromFilter: "", max: 40 }),
    },
  });
  revalidatePath("/agents");
}

export async function runAgentNow(formData: FormData): Promise<void> {
  const user = await requireUser();
  const agentId = String(formData.get("agentId"));
  await ownAgentOrThrow(agentId, user.id);
  await runAgent(agentId);
  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/stats");
}

export async function saveAgentConfig(formData: FormData): Promise<void> {
  const user = await requireUser();
  const agentId = String(formData.get("agentId"));
  await ownAgentOrThrow(agentId, user.id);

  const config = {
    sinceDays: Number(formData.get("sinceDays")) || 30,
    fromFilter: String(formData.get("fromFilter") ?? "").trim(),
    max: Number(formData.get("max")) || 40,
  };

  await prisma.agent.update({
    where: { id: agentId },
    data: {
      name: String(formData.get("name") ?? "Чеки из почты").trim() || "Чеки из почты",
      enabled: formData.get("enabled") === "on",
      config: JSON.stringify(config),
    },
  });
  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/agents");
}

export async function deleteAgent(formData: FormData): Promise<void> {
  const user = await requireUser();
  const agentId = String(formData.get("agentId"));
  await ownAgentOrThrow(agentId, user.id);
  await prisma.agent.delete({ where: { id: agentId } });
  revalidatePath("/agents");
}
