"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { ASSISTANT_APIS, type AssistantApi } from "@/lib/assistant-config";

export type FormState = { error?: string; ok?: string } | undefined;

/** Save the base assistant: model and what it may use. Unknown or foreign ids are dropped. */
export async function saveAssistant(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const modelId = String(formData.get("modelId") ?? "") || null;
  const model = modelId ? await prisma.llmModel.findUnique({ where: { id: modelId } }) : null;
  if (modelId && !model) return { error: "Такой модели нет — обновите страницу" };

  const own = await prisma.agent.findMany({ where: { ownerId: user.id }, select: { id: true, name: true } });
  const picked = formData.getAll("agent").map(String);
  const agents = own.filter((a) => picked.includes(a.id));
  const apis = formData.getAll("api").map(String).filter((k): k is AssistantApi => Object.prototype.hasOwnProperty.call(ASSISTANT_APIS, k));

  const conns = await prisma.mcpConnection.findMany({ where: { ownerId: user.id }, select: { id: true, name: true } });
  const pickedMcp = formData.getAll("mcp").map(String);
  const mcp = conns.filter((c) => pickedMcp.includes(c.id));
  const data = { modelId, agentIds: JSON.stringify(agents.map((a) => a.id)), mcpIds: JSON.stringify(mcp.map((c) => c.id)), apis: JSON.stringify(apis) };
  await prisma.assistant.upsert({ where: { ownerId: user.id }, create: { ownerId: user.id, ...data }, update: data });

  const list = (xs: string[]) => (xs.length ? xs.join(", ") : "нет");
  await audit("agent", `Настройки ассистента: модель — ${model?.name ?? "по умолчанию"}; агенты — ${list(agents.map((a) => `«${a.name}»`))}; MCP — ${list(mcp.map((c) => `«${c.name}»`))}; ` +
    `API — ${list(apis.map((k) => ASSISTANT_APIS[k].label))}`, user);
  revalidatePath("/agents");
  return { ok: "Настройки сохранены" };
}
