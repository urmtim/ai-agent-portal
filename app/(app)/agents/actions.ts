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

const clamp = (v: FormDataEntryValue | null, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min ? Math.min(n, max) : def;
};

/** «Изменить агента» modal: name, model, mail settings, enabled. */
export async function updateAgent(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const agentId = String(formData.get("agentId"));
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.ownerId !== user.id) return { error: "Агент не найден" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Укажите название" };
  const modelId = String(formData.get("modelId") ?? "") || null;
  if (modelId && !(await prisma.llmModel.findUnique({ where: { id: modelId } }))) return { error: "Такой модели нет — обновите страницу" };

  const config = {
    sinceDays: clamp(formData.get("sinceDays"), 1, 365, 30),
    fromFilter: String(formData.get("fromFilter") ?? "").trim(),
    max: clamp(formData.get("max"), 1, 200, 40),
  };
  const saved = await prisma.agent.update({
    where: { id: agentId },
    data: { modelId, name: name.slice(0, 80), enabled: formData.get("enabled") === "on", config: JSON.stringify(config) },
  });
  await audit("agent", `Сохранены настройки агента «${saved.name}»${saved.enabled ? "" : " (выключен)"}`, user);
  revalidateAgent(agentId);
  return { ok: "Сохранено" };
}

export async function deleteAgent(formData: FormData): Promise<void> {
  await deleteAgentById(String(formData.get("agentId")));
  redirect("/agents");
}
