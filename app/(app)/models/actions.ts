"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/secret";
import { pingModel } from "@/lib/llm";

export type FormState = { error?: string; ok?: string } | undefined;
export type TestState = { ok: boolean; message: string } | undefined;

const fields = z.object({
  id: z.string().optional(),
  name: z.string().trim().max(80),
  baseUrl: z.string().trim().regex(/^https?:\/\/\S+$/i, "Адрес должен начинаться с http:// или https://"),
  model: z.string().trim().min(1, "Укажите модель").max(120),
  token: z.string().trim().max(4000),
});

function parse(formData: FormData) {
  return fields.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name") ?? "",
    baseUrl: formData.get("baseUrl") ?? "",
    model: formData.get("model") ?? "",
    token: formData.get("token") ?? "",
  });
}

function revalidate() {
  revalidatePath("/models");
  revalidatePath("/agents");
}

/** Add or edit a model. Empty token on edit keeps the saved one, a new one replaces it. */
export async function saveModel(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const p = parse(formData);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте поля" };
  const { id, name, baseUrl, model, token } = p.data;
  const makeDefault = formData.get("isDefault") === "on";

  const tokenEnc = token ? encryptSecret(token) : undefined; // undefined → unchanged
  const data = { name: name || model, baseUrl: baseUrl.replace(/\/$/, ""), model, ...(tokenEnc !== undefined ? { tokenEnc } : {}) };

  await prisma.$transaction(async (tx) => {
    const first = (await tx.llmModel.count()) === 0;
    const saved = id
      ? await tx.llmModel.update({ where: { id }, data: { ...data, checkedAt: null, checkOk: null, checkMsg: "" } })
      : await tx.llmModel.create({ data: { ...data, tokenEnc: tokenEnc ?? null } });
    if (makeDefault || first) {
      await tx.llmModel.updateMany({ where: { id: { not: saved.id } }, data: { isDefault: false } });
      await tx.llmModel.update({ where: { id: saved.id }, data: { isDefault: true } });
    }
  });

  revalidate();
  return { ok: id ? "Модель сохранена" : "Модель добавлена" };
}

/** "Проверить" in the modal: pings the entered (unsaved) values; on edit an empty token means the saved one. */
export async function testModel(formData: FormData): Promise<TestState> {
  await requireAdmin();
  const p = parse(formData);
  if (!p.success) return { ok: false, message: "✕ " + (p.error.issues[0]?.message ?? "Проверьте поля") };
  let token: string | undefined = p.data.token || undefined;
  if (!token && p.data.id) {
    const saved = await prisma.llmModel.findUnique({ where: { id: p.data.id } });
    if (saved?.tokenEnc) token = decryptSecret(saved.tokenEnc) ?? undefined;
  }
  return pingModel({ baseUrl: p.data.baseUrl, model: p.data.model, token });
}

/** Row "Проверить": pings the saved model and stores the result as its status. */
export async function checkSavedModel(id: string): Promise<TestState> {
  await requireAdmin();
  const m = await prisma.llmModel.findUnique({ where: { id } });
  if (!m) return { ok: false, message: "Модель не найдена" };

  let r: { ok: boolean; message: string };
  const token = m.tokenEnc ? decryptSecret(m.tokenEnc) : undefined;
  if (token === null) r = { ok: false, message: "✕ Токен не читается — введите его заново" };
  else r = await pingModel({ baseUrl: m.baseUrl, model: m.model, token });

  await prisma.llmModel.update({ where: { id }, data: { checkedAt: new Date(), checkOk: r.ok, checkMsg: r.message } });
  revalidatePath("/models");
  return r;
}

/** Delete a model (not the default one); its agents fall back to the default. */
export async function deleteModel(id: string): Promise<FormState> {
  await requireAdmin();
  const m = await prisma.llmModel.findUnique({ where: { id } });
  if (!m) return { error: "Модель не найдена" };
  if (m.isDefault) return { error: "Модель по умолчанию удалить нельзя — сначала назначьте другую" };
  await prisma.llmModel.delete({ where: { id } });
  revalidate();
  return { ok: "Модель удалена" };
}
