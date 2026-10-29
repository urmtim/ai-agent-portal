"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { runAgent } from "@/lib/agents/runner";
import { AGENT_TYPES } from "@/lib/agents/types";
import { audit } from "@/lib/audit";
import { ASSISTANT_APIS } from "@/lib/assistant-config";

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

const clamp = (v: FormDataEntryValue | null, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min ? Math.min(n, max) : def;
};

/**
 * The agent window (create when there is no agentId, edit otherwise): «Общее» fields plus the agents, MCP servers
 * and APIs it may use. Foreign or unknown ids are dropped; an agent can't list itself.
 */
export async function saveAgent(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const agentId = String(formData.get("agentId") ?? "") || null;
  const existing = agentId ? await prisma.agent.findUnique({ where: { id: agentId } }) : null;
  if (agentId && (!existing || existing.ownerId !== user.id)) return { error: "Агент не найден" };

  const type = existing?.type ?? String(formData.get("type") ?? "");
  if (!Object.prototype.hasOwnProperty.call(AGENT_TYPES, type)) return { error: "Выберите тип агента" };
  const t = AGENT_TYPES[type as keyof typeof AGENT_TYPES];

  const name = (String(formData.get("name") ?? "").trim() || t.label).slice(0, 80);
  const modelId = String(formData.get("modelId") ?? "") || null;
  if (modelId && !(await prisma.llmModel.findFirst({ where: { id: modelId, ownerId: user.id } }))) return { error: "Такой модели нет — обновите страницу" };

  const own = await prisma.agent.findMany({ where: { ownerId: user.id }, select: { id: true } });
  const agentIds = formData.getAll("agent").map(String).filter((id) => id !== agentId && own.some((a) => a.id === id));
  const apis = formData.getAll("api").map(String).filter((k) => Object.prototype.hasOwnProperty.call(ASSISTANT_APIS, k));
  const conns = await prisma.mcpConnection.findMany({ where: { ownerId: user.id }, select: { id: true } });
  const mcpIds = formData.getAll("mcp").map(String).filter((id) => conns.some((c) => c.id === id));
  const config = {
    sinceDays: clamp(formData.get("sinceDays"), 1, 365, 30),
    fromFilter: String(formData.get("fromFilter") ?? "").trim(),
    max: clamp(formData.get("max"), 1, 200, 40),
  };
  const data = {
    name, modelId, enabled: formData.get("enabled") === "on", config: JSON.stringify(config),
    agentIds: JSON.stringify([...new Set(agentIds)]), mcpIds: JSON.stringify([...new Set(mcpIds)]), apis: JSON.stringify([...new Set(apis)]),
  };

  const saved = existing
    ? await prisma.agent.update({ where: { id: existing.id }, data })
    : await prisma.agent.create({ data: { ownerId: user.id, type: type as keyof typeof AGENT_TYPES, ...data } });
  const extra = agentIds.length ? `; агенты: ${agentIds.length}` : "";
  await audit("agent", existing
    ? `Сохранены настройки агента «${saved.name}»${saved.enabled ? "" : " (выключен)"}${extra}`
    : `Создан агент «${saved.name}» (${t.label})${extra}`, user);
  revalidateAgent(saved.id);
  return { ok: existing ? "Сохранено" : "Агент создан" };
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

export async function deleteAgent(formData: FormData): Promise<void> {
  await deleteAgentById(String(formData.get("agentId")));
  redirect("/agents");
}
