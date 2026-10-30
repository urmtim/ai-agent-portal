"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/secret";
import { listModels, pingModel } from "@/lib/llm";
import { listMessage, pingProblem } from "@/lib/model-list";
import { CONTEXT_MAX, CONTEXT_MIN } from "@/lib/model-spec";
import { audit } from "@/lib/audit";
import { modelUsers } from "@/lib/model-users";

/** Which field an error belongs to: the window shows it under that field and switches to its tab. */
export type ModelField = "name" | "baseUrl" | "token" | "model" | "contextTokens";
export type FormState = { error?: string; field?: ModelField; ok?: string } | undefined;
export type TestState = { ok: boolean; message: string } | undefined;
/** «Проверить» in the window: what to say and the server's models (sorted) when it gave a list. */
export type ListState = { kind: "ok" | "nolist" | "token" | "down" | "http"; message: string; models: string[] };

const URL_RE = /^https?:\/\/\S+$/i;
const str = (formData: FormData, k: string) => String(formData.get(k) ?? "").trim();

function revalidate() {
  revalidatePath("/models");
  revalidatePath("/agents");
}

/** The token to use: the typed one, else the saved one of this (own) model. */
async function tokenFor(ownerId: string, id: string, typed: string): Promise<string | undefined> {
  if (typed) return typed;
  if (!id) return undefined;
  const saved = await prisma.llmModel.findFirst({ where: { id, ownerId }, select: { tokenEnc: true } });
  return saved?.tokenEnc ? decryptSecret(saved.tokenEnc) ?? undefined : undefined;
}

/** «Проверить» on «Параметры»: asks the entered (unsaved) address for its models; on edit an empty token means the saved one. */
export async function listModelsFor(formData: FormData): Promise<ListState> {
  const user = await requireUser();
  const baseUrl = str(formData, "baseUrl");
  if (!URL_RE.test(baseUrl)) return { kind: "down", message: "✕ Адрес должен начинаться с http:// или https://", models: [] };
  const token = await tokenFor(user.id, str(formData, "id"), str(formData, "token"));
  if (!token) return { kind: "token", message: "✕ Укажите токен", models: [] };
  const r = await listModels({ baseUrl, token });
  return { kind: r.kind, message: listMessage(r), models: r.kind === "ok" ? r.models : [] };
}

/**
 * Add or edit a model. Fields are checked top to bottom and only the first problem is returned.
 * An empty token on edit keeps the saved one. A new model, or another address, token or model, gets a test
 * request first: «бубубу» and a wrong token are never saved (a server's list may be open without any token).
 */
export async function saveModel(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(formData, "id");
  const name = str(formData, "name").slice(0, 80), description = str(formData, "description").slice(0, 300);
  const baseUrl = str(formData, "baseUrl").replace(/\/$/, ""), token = str(formData, "token").slice(0, 4000);
  const model = str(formData, "model").slice(0, 120), ctx = Number(str(formData, "contextTokens"));

  // models are personal: only the owner edits
  const saved = id ? await prisma.llmModel.findFirst({ where: { id, ownerId: user.id } }) : null;
  if (id && !saved) return { error: "Такой модели нет — обновите страницу" };

  if (!name) return { field: "name", error: "Укажите название" };
  if (!baseUrl) return { field: "baseUrl", error: "Укажите адрес API" };
  if (!URL_RE.test(baseUrl)) return { field: "baseUrl", error: "Адрес должен начинаться с http:// или https://" };
  if (!token && !saved?.tokenEnc) return { field: "token", error: "Укажите токен" };
  if (!model) return { field: "model", error: "Укажите модель" };
  if (!str(formData, "contextTokens")) return { field: "contextTokens", error: "Укажите размер контекста" };
  if (!Number.isInteger(ctx) || ctx < CONTEXT_MIN || ctx > CONTEXT_MAX) return { field: "contextTokens", error: "Контекст — от 2 000 до 2 000 000 токенов" };

  // a new model, or another address, token or model: it must really answer with this token
  // the answer becomes its status; a save that changes nothing of that keeps the status it had
  let checked: { checkedAt: Date; checkOk: boolean; checkMsg: string } | undefined;
  if (!saved || saved.model !== model || saved.baseUrl !== baseUrl || token) {
    const ping = await pingModel({ baseUrl, model, token: await tokenFor(user.id, id, token) });
    const problem = pingProblem(ping, model);
    if (problem) return problem;
    checked = { checkedAt: new Date(), checkOk: true, checkMsg: ping.message };
  }

  const tokenEnc = token ? encryptSecret(token) : undefined; // undefined → unchanged
  const data = { name, description, baseUrl, model, contextTokens: ctx, ...(tokenEnc !== undefined ? { tokenEnc } : {}), ...checked };
  let firstFor = "";
  await prisma.$transaction(async (tx) => {
    if (saved) {
      await tx.llmModel.update({ where: { id: saved.id }, data });
      return;
    }
    const created = await tx.llmModel.create({ data: { ...data, ownerId: user.id, tokenEnc: tokenEnc ?? null } });
    // the first model: the assistant and agents without a model get it — nobody works on «nothing chosen»
    const a = await tx.assistant.findUnique({ where: { ownerId: user.id }, select: { modelId: true } });
    if (!a) await tx.assistant.create({ data: { ownerId: user.id, modelId: created.id } });
    else if (!a.modelId) await tx.assistant.update({ where: { ownerId: user.id }, data: { modelId: created.id } });
    const agents = await tx.agent.updateMany({ where: { ownerId: user.id, modelId: null }, data: { modelId: created.id } });
    if (!a?.modelId) firstFor = `; выбрана у Ассистента${agents.count ? ` и ${agents.count} агент(ов)` : ""}`;
  });

  // never the token itself — only whether it changed
  await audit("model", `${saved ? "Изменена" : "Добавлена"} модель «${name}» (${model}, ${baseUrl})` +
    `${token ? (saved ? ", токен заменён" : ", с токеном") : ""}${firstFor}`, user);
  revalidate();
  return { ok: saved ? "Модель сохранена" : "Модель добавлена" };
}

/** Row "Проверить": pings the saved model and stores the result as its status. */
export async function checkSavedModel(id: string): Promise<TestState> {
  const user = await requireUser();
  const m = await prisma.llmModel.findFirst({ where: { id, ownerId: user.id } });
  if (!m) return { ok: false, message: "Модель не найдена" };

  let r: { ok: boolean; message: string };
  const token = m.tokenEnc ? decryptSecret(m.tokenEnc) : undefined;
  if (token === null) r = { ok: false, message: "✕ Токен не читается — введите его заново" };
  else r = await pingModel({ baseUrl: m.baseUrl, model: m.model, token });

  await prisma.llmModel.update({ where: { id }, data: { checkedAt: new Date(), checkOk: r.ok, checkMsg: r.message } });
  await audit("model", `Проверка модели «${m.name}»: ${r.message}`, user);
  revalidatePath("/models");
  return r;
}

/** Delete a model nobody works on; a model in use stays and the answer names who uses it. */
export async function deleteModel(id: string): Promise<FormState & { usedBy?: string[] }> {
  const user = await requireUser();
  const m = await prisma.llmModel.findFirst({ where: { id, ownerId: user.id } });
  if (!m) return { error: "Модель не найдена" };
  const usedBy = (await modelUsers(user.id)).get(id) ?? [];
  if (usedBy.length) return { error: `Её используют: ${usedBy.join(", ")}. Сначала выберите им другую модель.`, usedBy };
  await prisma.llmModel.delete({ where: { id } });
  await audit("model", `Удалена модель «${m.name}» (${m.model})`, user);
  revalidate();
  return { ok: "Модель удалена" };
}
