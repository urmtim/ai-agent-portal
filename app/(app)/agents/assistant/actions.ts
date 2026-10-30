"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { HITL_LABELS, ownGuardRules, parseHitl } from "@/lib/agents/policy";

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

  const conns = await prisma.connector.findMany({ where: { ownerId: user.id }, select: { id: true, name: true } });
  const docs = await prisma.guardrailDoc.findMany({ where: { ownerId: user.id }, select: { id: true } });
  const guardrails = ownGuardRules(String(formData.get("guardrails") ?? ""), docs.map((d) => d.id));
  const pickedConns = formData.getAll("connector").map(String);
  const connectors = conns.filter((c) => pickedConns.includes(c.id));
  const data = {
    modelId, agentIds: JSON.stringify(agents.map((a) => a.id)), connectorIds: JSON.stringify(connectors.map((c) => c.id)),
    hitl: parseHitl(String(formData.get("hitl") ?? "")),
    guardrails: JSON.stringify({ rules: guardrails }),
  };
  await prisma.assistant.upsert({ where: { ownerId: user.id }, create: { ownerId: user.id, ...data }, update: data });

  const list = (xs: string[]) => (xs.length ? xs.join(", ") : "нет");
  await audit("agent", `Настройки ассистента: модель — ${model?.name ?? "не выбрана"}; агенты — ${list(agents.map((a) => `«${a.name}»`))}; коннекторы — ${list(connectors.map((c) => `«${c.name}»`))}; ` +
    `HITL — ${HITL_LABELS[data.hitl].toLowerCase()}; гардрейлов — ${guardrails.length}`, user);
  revalidatePath("/agents");
  return { ok: "Настройки сохранены" };
}
