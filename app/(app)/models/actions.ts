"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/secret";
import { pingModel } from "@/lib/llm";
import { audit } from "@/lib/audit";

export type FormState = { error?: string; ok?: string } | undefined;
export type TestState = { ok: boolean; message: string } | undefined;

const fields = z.object({
  id: z.string().optional(),
  name: z.string().trim().max(80),
  baseUrl: z.string().trim().regex(/^https?:\/\/\S+$/i, "Адрес должен начинаться с http:// или https://"),
  model: z.string().trim().min(1, "Укажите модель").max(120),
  token: z.string().trim().max(4000),
  contextTokens: z.coerce.number().int("Контекст — от 2 000 до 2 000 000 токенов").min(2000, "Контекст — от 2 000 до 2 000 000 токенов").max(2000000, "Контекст — от 2 000 до 2 000 000 токенов"),
});

function parse(formData: FormData) {
  return fields.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name") ?? "",
    baseUrl: formData.get("baseUrl") ?? "",
    model: formData.get("model") ?? "",
    token: formData.get("token") ?? "",
    contextTokens: formData.get("contextTokens") || 32000, // «Проверить» and old forms may not send it
  });
}

function revalidate() {
  revalidatePath("/models");
  revalidatePath("/agents");
}

/** Add or edit a model. Empty token on edit keeps the saved one, a new one replaces it. */
export async function saveModel(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = parse(formData);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте поля" };
  const { id, name, baseUrl, model, token, contextTokens } = p.data;
  const makeDefault = formData.get("isDefault") === "on";

  const tokenEnc = token ? encryptSecret(token) : undefined; // undefined → unchanged
  const data = { name: name || model, baseUrl: baseUrl.replace(/\/$/, ""), model, contextTokens, ...(tokenEnc !== undefined ? { tokenEnc } : {}) };

  // models are personal: only the owner edits, and «по умолчанию» is per owner
  if (id && !(await prisma.llmModel.findFirst({ where: { id, ownerId: user.id } }))) return { error: "Такой модели нет — обновите страницу" };
  await prisma.$transaction(async (tx) => {
    const first = (await tx.llmModel.count({ where: { ownerId: user.id } })) === 0;
    const saved = id
      ? await tx.llmModel.update({ where: { id }, data: { ...data, checkedAt: null, checkOk: null, checkMsg: "" } })
      : await tx.llmModel.create({ data: { ...data, ownerId: user.id, tokenEnc: tokenEnc ?? null } });
    if (makeDefault || first) {
      await tx.llmModel.updateMany({ where: { ownerId: user.id, id: { not: saved.id } }, data: { isDefault: false } });
      await tx.llmModel.update({ where: { id: saved.id }, data: { isDefault: true } });
    }
  });

  // never the token itself — only whether it changed
  await audit("model", `${id ? "Изменена" : "Добавлена"} модель «${data.name}» (${data.model}, ${data.baseUrl})` +
    `${token ? (id ? ", токен заменён" : ", с токеном") : ""}${makeDefault ? ", по умолчанию" : ""}`, user);
  revalidate();
  return { ok: id ? "Модель сохранена" : "Модель добавлена" };
}

/** "Проверить" in the modal: pings the entered (unsaved) values; on edit an empty token means the saved one. */
export async function testModel(formData: FormData): Promise<TestState> {
  const user = await requireUser();
  const p = parse(formData);
  if (!p.success) return { ok: false, message: "✕ " + (p.error.issues[0]?.message ?? "Проверьте поля") };
  let token: string | undefined = p.data.token || undefined;
  if (!token && p.data.id) {
    const saved = await prisma.llmModel.findFirst({ where: { id: p.data.id, ownerId: user.id } });
    if (saved?.tokenEnc) token = decryptSecret(saved.tokenEnc) ?? undefined;
  }
  return pingModel({ baseUrl: p.data.baseUrl, model: p.data.model, token });
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

/** Delete a model (not the default one); its agents fall back to the default. */
export async function deleteModel(id: string): Promise<FormState> {
  const user = await requireUser();
  const m = await prisma.llmModel.findFirst({ where: { id, ownerId: user.id } });
  if (!m) return { error: "Модель не найдена" };
  // the default one can go too: the earliest model left becomes the default
  const next = m.isDefault ? await prisma.llmModel.findFirst({ where: { ownerId: user.id, id: { not: id } }, orderBy: { createdAt: "asc" } }) : null;
  await prisma.$transaction([
    prisma.llmModel.delete({ where: { id } }),
    ...(next ? [prisma.llmModel.update({ where: { id: next.id }, data: { isDefault: true } })] : []),
  ]);
  await audit("model", `Удалена модель «${m.name}» (${m.model})${next ? `; по умолчанию теперь «${next.name}»` : ""}`, user);
  revalidate();
  return { ok: "Модель удалена" };
}
