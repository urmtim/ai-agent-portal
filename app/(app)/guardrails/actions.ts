"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { docKind, docMime, extractDocText, fileLabel, fileProblem } from "@/lib/guardrail-docs";
import { parseGuardRules } from "@/lib/agents/policy";

// The user's guardrail documents. Someone else's document behaves as missing; the file never goes back to the browser.

export type FormState = { error?: string; ok?: string } | undefined;

function revalidate() {
  revalidatePath("/guardrails");
  revalidatePath("/agents");
}

/** Add or edit a document. On edit an empty file input keeps the saved file. */
export async function saveGuardrailDoc(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "") || null;
  const existing = id ? await prisma.guardrailDoc.findUnique({ where: { id } }) : null;
  if (id && (!existing || existing.ownerId !== user.id)) return { error: "Документ не найден" };

  const file = fd.get("file");
  const picked = file instanceof File && file.size > 0 && file.name ? file : null;
  if (!picked && !existing) return { error: "Выберите файл: docx, pdf, txt или md" };

  let upload: { fileName: string; mime: string; size: number; data: Uint8Array<ArrayBuffer>; text: string } | null = null;
  if (picked) {
    const problem = fileProblem(picked.name, picked.size);
    if (problem) return { error: problem };
    const data = new Uint8Array(await picked.arrayBuffer());
    let text: string;
    try { text = await extractDocText(picked.name, data); } catch (e) { return { error: (e as Error).message }; }
    upload = { fileName: picked.name.slice(0, 200), mime: docMime(docKind(picked.name)!), size: picked.size, data, text };
  }

  const fileName = upload?.fileName ?? existing!.fileName;
  const name = (String(fd.get("name") ?? "").trim() || fileName.replace(/\.[^.]+$/, "")).slice(0, 80);
  const data = {
    name,
    description: String(fd.get("description") ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 500),
    enabled: fd.get("enabled") === "on",
    ...(upload ?? {}),
  };

  const saved = existing
    ? await prisma.guardrailDoc.update({ where: { id: existing.id }, data })
    : await prisma.guardrailDoc.create({ data: { ownerId: user.id, ...data, fileName, mime: upload!.mime, size: upload!.size, data: upload!.data, text: upload!.text } });
  await audit("guardrail", `${existing ? "Изменён" : "Добавлен"} документ-гардрейл «${saved.name}» (${fileLabel(saved.fileName, saved.size)}${upload && existing ? ", файл заменён" : ""})` +
    `${saved.enabled ? "" : ", выключен"}`, user);
  revalidate();
  return { ok: existing ? "Документ сохранён" : "Документ добавлен" };
}

/** Delete a document; agents and the assistant lose it from their guardrails. */
export async function deleteGuardrailDoc(id: string): Promise<FormState> {
  const user = await requireUser();
  const doc = await prisma.guardrailDoc.findUnique({ where: { id } });
  if (!doc || doc.ownerId !== user.id) return { error: "Документ не найден" };

  const strip = (raw: string) => JSON.stringify({ rules: parseGuardRules(raw).filter((r) => !(r.kind === "document" && r.id === id)) });
  const [agents, assistant] = await Promise.all([
    prisma.agent.findMany({ where: { ownerId: user.id }, select: { id: true, guardrails: true } }),
    prisma.assistant.findUnique({ where: { ownerId: user.id }, select: { guardrails: true } }),
  ]);
  await prisma.$transaction([
    ...agents.filter((a) => a.guardrails.includes(id)).map((a) => prisma.agent.update({ where: { id: a.id }, data: { guardrails: strip(a.guardrails) } })),
    ...(assistant?.guardrails.includes(id) ? [prisma.assistant.update({ where: { ownerId: user.id }, data: { guardrails: strip(assistant.guardrails) } })] : []),
    prisma.guardrailDoc.delete({ where: { id } }),
  ]);
  await audit("guardrail", `Удалён документ-гардрейл «${doc.name}»`, user);
  revalidate();
  return { ok: "Документ удалён" };
}
