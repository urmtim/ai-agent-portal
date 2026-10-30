"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { ASSISTANT_APIS, type AssistantApi } from "@/lib/assistant-config";
import { HITL_LABELS, ownGuardRules, parseHitl, parseMcpAccess } from "@/lib/agents/policy";

export type FormState = { error?: string; ok?: string } | undefined;

/** Save the base assistant: model and what it may use. Unknown or foreign ids are dropped. */
export async function saveAssistant(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const modelId = String(formData.get("modelId") ?? "") || null;
  const model = modelId ? await prisma.llmModel.findFirst({ where: { id: modelId, ownerId: user.id } }) : null;
  if (modelId && !model) return { error: "Такой модели нет — обновите страницу" };
  // no fallback model any more: with models around, one has to be chosen
  if (!modelId && (await prisma.llmModel.count({ where: { ownerId: user.id } })) > 0) return { error: "Выберите модель" };

  const own = await prisma.agent.findMany({ where: { ownerId: user.id }, select: { id: true, name: true } });
  const picked = formData.getAll("agent").map(String);
  const agents = own.filter((a) => picked.includes(a.id));
  const apis = formData.getAll("api").map(String).filter((k): k is AssistantApi => Object.prototype.hasOwnProperty.call(ASSISTANT_APIS, k));

  const conns = await prisma.mcpConnection.findMany({ where: { ownerId: user.id }, select: { id: true, name: true } });
  const docs = await prisma.guardrailDoc.findMany({ where: { ownerId: user.id }, select: { id: true } });
  const guardrails = ownGuardRules(String(formData.get("guardrails") ?? ""), docs.map((d) => d.id));
  const pickedMcp = formData.getAll("mcp").map(String);
  const mcp = conns.filter((c) => pickedMcp.includes(c.id));
  const access = parseMcpAccess(String(formData.get("mcpAccess") ?? "{}"));
  const data = {
    modelId, agentIds: JSON.stringify(agents.map((a) => a.id)), mcpIds: JSON.stringify(mcp.map((c) => c.id)), apis: JSON.stringify(apis),
    mcpAccess: JSON.stringify(Object.fromEntries(mcp.map((c) => [c.id, access[c.id] ?? "read"]))),
    hitl: parseHitl(String(formData.get("hitl") ?? "")),
    guardrails: JSON.stringify({ rules: guardrails }),
  };
  await prisma.assistant.upsert({ where: { ownerId: user.id }, create: { ownerId: user.id, ...data }, update: data });

  const list = (xs: string[]) => (xs.length ? xs.join(", ") : "нет");
  await audit("agent", `Настройки ассистента: модель — ${model?.name ?? "по умолчанию"}; агенты — ${list(agents.map((a) => `«${a.name}»`))}; MCP — ${list(mcp.map((c) => `«${c.name}»`))}; ` +
    `API — ${list(apis.map((k) => ASSISTANT_APIS[k].label))}; HITL — ${HITL_LABELS[data.hitl].toLowerCase()}; гардрейлов — ${guardrails.length}`, user);
  revalidatePath("/agents");
  return { ok: "Настройки сохранены" };
}
