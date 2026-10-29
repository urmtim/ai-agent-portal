"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { runAgent } from "@/lib/agents/runner";
import { AGENT_TYPES } from "@/lib/agents/types";
import { audit } from "@/lib/audit";

export type FormState = { error?: string; ok?: string } | undefined;

async function ownAgentOrThrow(agentId: string, userId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.ownerId !== userId) throw new Error("Агент не найден");
  return agent;
}

function revalidateAgent(agentId: string) {
  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
}

const createSchema = z.object({
  type: z.enum(["RECEIPTS"]),
  name: z.string().trim().max(80),
});

/** Create an agent of the chosen type with its default settings. */
export async function createAgent(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = createSchema.safeParse({ type: formData.get("type"), name: formData.get("name") ?? "" });
  if (!parsed.success) return { error: "Выберите тип агента" };

  const t = AGENT_TYPES[parsed.data.type];
  const agent = await prisma.agent.create({
    data: {
      ownerId: user.id,
      type: parsed.data.type,
      name: parsed.data.name || t.label,
      config: JSON.stringify(t.defaultConfig),
    },
  });
  await audit("agent", `Создан агент «${agent.name}» (${t.label})`, user);
  revalidatePath("/agents");
  return { ok: "Агент создан" };
}

/** Run an agent now; returns the run summary for a toast. */
export async function runAgentById(agentId: string): Promise<FormState> {
  const user = await requireUser();
  await ownAgentOrThrow(agentId, user.id);
  const runId = await runAgent(agentId, { actor: user, channel: "портал" });
  const run = await prisma.agentRun.findUnique({ where: { id: runId } });
  revalidateAgent(agentId);
  revalidatePath("/stats");
  return run?.status === "OK" ? { ok: run.summary } : { error: `Ошибка прогона: ${run?.summary ?? "неизвестно"}` };
}

/** Delete an agent with its run history (collected receipts stay). */
export async function deleteAgentById(agentId: string): Promise<FormState> {
  const user = await requireUser();
  const agent = await ownAgentOrThrow(agentId, user.id);
  await prisma.agent.delete({ where: { id: agentId } });
  await audit("agent", `Удалён агент «${agent.name}»`, user);
  revalidatePath("/agents");
  return { ok: "Агент удалён" };
}

// ---- form actions used by the agent page (/agents/[id]) ----

export async function runAgentNow(formData: FormData): Promise<void> {
  await runAgentById(String(formData.get("agentId")));
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

  const modelId = String(formData.get("modelId") ?? "") || null;
  if (modelId && !(await prisma.llmModel.findUnique({ where: { id: modelId } }))) throw new Error("Модель не найдена");

  const saved = await prisma.agent.update({
    where: { id: agentId },
    data: {
      modelId,
      name: String(formData.get("name") ?? "Чеки из почты").trim() || "Чеки из почты",
      enabled: formData.get("enabled") === "on",
      config: JSON.stringify(config),
    },
  });
  await audit("agent", `Сохранены настройки агента «${saved.name}»${saved.enabled ? "" : " (выключен)"}`, user);
  revalidateAgent(agentId);
}

export async function deleteAgent(formData: FormData): Promise<void> {
  await deleteAgentById(String(formData.get("agentId")));
  redirect("/agents");
}
