"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { runAgent } from "@/lib/agents/runner";
import { AGENT_TYPES } from "@/lib/agents/types";
import { audit } from "@/lib/audit";
import { ASSISTANT_APIS } from "@/lib/assistant-config";
import { HITL_LABELS, ownGuardRules, parseHitl, parseMcpAccess } from "@/lib/agents/policy";

/** id — the saved agent. */
export type FormState = { error?: string; ok?: string; id?: string } | undefined;

async function ownAgentOrThrow(agentId: string, userId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.ownerId !== userId) throw new Error("Агент не найден");
  return agent;
}

function revalidateAgent(agentId: string) {
  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
}

/**
 * The agent window (create when there is no agentId, edit otherwise): «Общее», policies (HITL, guardrails),
 * subagents, MCP connections with access, APIs. Foreign or unknown ids are dropped; an agent can't list itself.
 * New agents are «Свои» (CUSTOM): built-in types are no longer offered.
 */
export async function saveAgent(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const agentId = String(formData.get("agentId") ?? "") || null;
  const existing = agentId ? await prisma.agent.findUnique({ where: { id: agentId } }) : null;
  if (agentId && (!existing || existing.ownerId !== user.id)) return { error: "Агент не найден" };

  const name = (String(formData.get("name") ?? "").trim() || AGENT_TYPES.CUSTOM.label).slice(0, 80);
  const modelId = String(formData.get("modelId") ?? "") || null;
  if (modelId && !(await prisma.llmModel.findFirst({ where: { id: modelId, ownerId: user.id } }))) return { error: "Такой модели нет — обновите страницу" };
  // no fallback model any more: with models around, one has to be chosen
  if (!modelId && (await prisma.llmModel.count({ where: { ownerId: user.id } })) > 0) return { error: "Выберите модель" };

  const own = await prisma.agent.findMany({ where: { ownerId: user.id }, select: { id: true } });
  const agentIds = formData.getAll("agent").map(String).filter((id) => id !== agentId && own.some((a) => a.id === id));
  const apis = formData.getAll("api").map(String).filter((k) => Object.prototype.hasOwnProperty.call(ASSISTANT_APIS, k));
  const conns = await prisma.mcpConnection.findMany({ where: { ownerId: user.id }, select: { id: true } });
  const mcpIds = [...new Set(formData.getAll("mcp").map(String).filter((id) => conns.some((c) => c.id === id)))];
  const access = parseMcpAccess(String(formData.get("mcpAccess") ?? "{}"));
  const hitl = parseHitl(String(formData.get("hitl") ?? ""));
  const docs = await prisma.guardrailDoc.findMany({ where: { ownerId: user.id }, select: { id: true } });
  const guardrails = ownGuardRules(String(formData.get("guardrails") ?? ""), docs.map((d) => d.id));
  const data = {
    name, modelId, enabled: formData.get("enabled") === "on",
    description: String(formData.get("description") ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 300),
    instruction: String(formData.get("instruction") ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 8000), // forms send \r\n
    hitl,
    guardrails: JSON.stringify({ rules: guardrails }),
    agentIds: JSON.stringify([...new Set(agentIds)]), mcpIds: JSON.stringify(mcpIds), apis: JSON.stringify([...new Set(apis)]),
    mcpAccess: JSON.stringify(Object.fromEntries(mcpIds.map((id) => [id, access[id] ?? "read"]))),
  };

  const saved = existing
    ? await prisma.agent.update({ where: { id: existing.id }, data })
    : await prisma.agent.create({ data: { ownerId: user.id, type: "CUSTOM", ...data } });
  const extra = agentIds.length ? `; субагенты: ${agentIds.length}` : "";
  const pol = `HITL — ${HITL_LABELS[hitl].toLowerCase()}, гардрейлов: ${guardrails.length}`;
  await audit("agent", existing
    ? `Сохранены настройки агента «${saved.name}»${saved.enabled ? "" : " (выключен)"}: ${pol}${extra}`
    : `Создан агент «${saved.name}»: ${pol}${extra}`, user);
  revalidateAgent(saved.id);
  return { ok: existing ? "Сохранено" : "Агент создан", id: saved.id };
}

/** Run an agent now (with a task for «Свой агент»); returns the run summary for a toast. */
export async function runAgentById(agentId: string, task = ""): Promise<FormState> {
  const user = await requireUser();
  await ownAgentOrThrow(agentId, user.id);
  const runId = await runAgent(agentId, { actor: user, channel: "портал" }, task.trim().slice(0, 2000));
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
  await runAgentById(String(formData.get("agentId")), String(formData.get("task") ?? ""));
}

export async function deleteAgent(formData: FormData): Promise<void> {
  await deleteAgentById(String(formData.get("agentId")));
  redirect("/agents");
}
