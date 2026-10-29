"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { encryptSecret } from "@/lib/secret";
import { CONNECTORS, isConnectorKind, mailConfigFromForm, type MailConfig } from "@/lib/connectors";
import { mailAccess } from "@/lib/connections";
import { checkMailbox } from "@/lib/mailbox";

// The user's MCP connections. Someone else's connection behaves as missing; secrets never leave the server.

export type FormState = { error?: string; ok?: string } | undefined;
export type TestState = { ok: boolean; message: string } | undefined;

async function own(id: string) {
  const user = await requireUser();
  const c = await prisma.mcpConnection.findUnique({ where: { id } });
  return { user, c: c && c.ownerId === user.id ? c : null };
}

function mailFromForm(fd: FormData): MailConfig | string {
  return mailConfigFromForm({
    preset: String(fd.get("preset") ?? "other"), host: String(fd.get("host") ?? ""), port: String(fd.get("port") ?? ""),
    secure: fd.get("secure") === "on", user: String(fd.get("user") ?? ""),
  });
}

const where = (m: MailConfig) => `${m.user}, ${m.host}:${m.port}`;

/** Add or edit a connection. An empty password on edit keeps the saved one. */
export async function saveConnection(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "") || null;
  const existing = id ? await prisma.mcpConnection.findUnique({ where: { id } }) : null;
  if (id && (!existing || existing.ownerId !== user.id)) return { error: "Подключение не найдено" };

  const kind = existing?.kind ?? String(fd.get("kind") ?? "");
  if (!isConnectorKind(kind)) return { error: "Выберите коннектор" };
  const mail = mailFromForm(fd);
  if (typeof mail === "string") return { error: mail };
  const password = String(fd.get("password") ?? "");
  if (!existing && !password) return { error: "Введите пароль приложения" };

  const name = (String(fd.get("name") ?? "").trim() || `${CONNECTORS[kind].label} ${mail.user}`).slice(0, 80);
  const data = {
    name, config: JSON.stringify(mail),
    ...(password ? { secretEnc: encryptSecret(password) } : {}),
    checkedAt: null, checkOk: null, checkMsg: "", // settings changed → check again
  };
  if (existing) await prisma.mcpConnection.update({ where: { id: existing.id }, data });
  else await prisma.mcpConnection.create({ data: { ownerId: user.id, kind, ...data } });

  await audit("mcp", `${existing ? "Изменено" : "Добавлено"} подключение «${name}» (${CONNECTORS[kind].label}: ${where(mail)})` +
    (existing && password ? ", пароль заменён" : ""), user);
  revalidatePath("/mcp");
  return { ok: existing ? "Подключение сохранено" : "Подключение добавлено" };
}

/** «Проверить» in the modal: tries the entered values; on edit an empty password means the saved one. */
export async function testConnection(fd: FormData): Promise<TestState> {
  const user = await requireUser();
  const mail = mailFromForm(fd);
  if (typeof mail === "string") return { ok: false, message: `✕ ${mail}` };
  let pass = String(fd.get("password") ?? "");
  const id = String(fd.get("id") ?? "");
  if (!pass && id) {
    const saved = await prisma.mcpConnection.findUnique({ where: { id } });
    if (saved && saved.ownerId === user.id) {
      try { pass = mailAccess(saved).pass; } catch (e) { return { ok: false, message: `✕ ${(e as Error).message}` }; }
    }
  }
  if (!pass) return { ok: false, message: "✕ Введите пароль приложения" };
  return checkMailbox({ ...mail, pass });
}

/** Row «Проверить»: checks the saved connection and stores the result as its status. */
export async function checkConnection(id: string): Promise<TestState> {
  const { user, c } = await own(id);
  if (!c) return { ok: false, message: "Подключение не найдено" };
  let r: { ok: boolean; message: string };
  try { r = await checkMailbox(mailAccess(c)); } catch (e) { r = { ok: false, message: `✕ ${(e as Error).message}` }; }
  await prisma.mcpConnection.update({ where: { id: c.id }, data: { checkedAt: new Date(), checkOk: r.ok, checkMsg: r.message } });
  await audit("mcp", `Проверка подключения «${c.name}»: ${r.message}`, user);
  revalidatePath("/mcp");
  return r;
}

/** Delete a connection; agents and the assistant simply stop seeing it. */
export async function deleteConnection(id: string): Promise<FormState> {
  const { user, c } = await own(id);
  if (!c) return { error: "Подключение не найдено" };
  await prisma.mcpConnection.delete({ where: { id: c.id } });
  await audit("mcp", `Удалено подключение «${c.name}»`, user);
  revalidatePath("/mcp");
  revalidatePath("/agents");
  return { ok: "Подключение удалено" };
}
