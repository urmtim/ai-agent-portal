"use server";

import { revalidatePath } from "next/cache";
import type { Connector } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/secret";
import {
  CONNECTORS, apiConfigFromForm, isConnectorKind, mailConfigFromForm,
  type ApiConfig, type ConnectorField, type ConnectorKind, type MailConfig,
} from "@/lib/connectors";
import { apiAccess, checkApi, mailAccess } from "@/lib/connections";
import { checkMailbox } from "@/lib/mailbox";

// The user's connectors. Someone else's connector behaves as missing; passwords and tokens never leave the server.

export type FormState = { error?: string; field?: ConnectorField; ok?: string } | undefined;
export type TestState = { ok: boolean; message: string; field?: ConnectorField };

const NOT_FOUND = "Коннектор не найден";

async function own(id: string) {
  const user = await requireUser();
  const c = await prisma.connector.findUnique({ where: { id } });
  return { user, c: c && c.ownerId === user.id ? c : null };
}

type Parsed = { kind: "mail"; config: MailConfig } | { kind: "api"; config: ApiConfig };

/** The window's connection fields → settings, or the first problem under its field. */
function parseFields(kind: ConnectorKind, fd: FormData): Parsed | TestState {
  const s = (k: string) => String(fd.get(k) ?? "");
  if (kind === "mail") {
    const m = mailConfigFromForm({ protocol: s("protocol"), host: s("host"), port: s("port"), smtpHost: s("smtpHost"), smtpPort: s("smtpPort"), user: s("user") });
    return "field" in m ? { ok: false, message: `✕ ${m.error}`, field: m.field } : { kind, config: m };
  }
  const a = apiConfigFromForm({ url: s("url") });
  return "field" in a ? { ok: false, message: `✕ ${a.error}`, field: a.field } : { kind, config: a };
}

/** The password or token to try: the one typed, else the saved one (empty → none). */
function secretFor(fd: FormData, saved: Connector | null): string {
  const typed = String(fd.get("secret") ?? "");
  if (typed || !saved?.secretEnc) return typed;
  return decryptSecret(saved.secretEnc) ?? "";
}

/** Connects with these settings; a failure names the field it belongs to. */
async function connect(p: Parsed, secret: string): Promise<TestState> {
  if (p.kind === "api") {
    const r = await checkApi({ url: p.config.url, token: secret || null });
    return r.ok ? r : { ...r, field: r.message.includes("токен") ? "token" : "url" };
  }
  const r = await checkMailbox({ ...p.config, pass: secret });
  if (r.ok) return { ok: true, message: r.message };
  const field: ConnectorField = r.where === "smtp" ? "smtpHost" : /логин|пароль/i.test(r.message) ? "password" : "host";
  return { ok: false, message: r.message, field };
}

const secretLabel = (kind: ConnectorKind) => (kind === "mail" ? "пароль" : "токен");

/** «Проверить» in the window: the entered values; on edit an empty password means the saved one. */
export async function testConnector(fd: FormData): Promise<TestState> {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "");
  const saved = id ? await prisma.connector.findUnique({ where: { id } }) : null;
  if (id && (!saved || saved.ownerId !== user.id)) return { ok: false, message: `✕ ${NOT_FOUND}` };
  const kind = saved?.kind ?? String(fd.get("kind") ?? "");
  if (!isConnectorKind(kind)) return { ok: false, message: "✕ Выберите тип" };
  const p = parseFields(kind, fd);
  if (!("kind" in p)) return p;
  const secret = secretFor(fd, saved);
  if (kind === "mail" && !secret) return { ok: false, message: "✕ Укажите пароль", field: "password" };
  return connect(p, secret);
}

/** Add or edit a connector. A new one, or one with changed connection or password, connects first and is not saved on failure. */
export async function saveConnector(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(fd.get("id") ?? "") || null;
  const existing = id ? await prisma.connector.findUnique({ where: { id } }) : null;
  if (id && (!existing || existing.ownerId !== user.id)) return { error: NOT_FOUND };

  const kind = existing?.kind ?? String(fd.get("kind") ?? "");
  if (!isConnectorKind(kind)) return { error: "Выберите тип" };
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { error: "Укажите название", field: "name" };
  const p = parseFields(kind, fd);
  if (!("kind" in p)) return { error: p.message.replace(/^✕ /, ""), field: p.field };
  const typed = String(fd.get("secret") ?? "");
  const secret = secretFor(fd, existing);
  if (kind === "mail" && !secret) return { error: "Укажите пароль", field: "password" };

  const config = JSON.stringify(p.config);
  const changed = !existing || existing.config !== config || !!typed;
  let check: TestState | null = null;
  if (changed) {
    check = await connect(p, secret);
    if (!check.ok) return { error: check.message.replace(/^✕ /, ""), field: check.field };
  }

  const enabled = fd.get("enabled") === "on";
  const data = {
    name, enabled, config,
    description: String(fd.get("description") ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 300),
    ...(typed ? { secretEnc: encryptSecret(typed) } : {}),
    ...(check ? { checkedAt: new Date(), checkOk: true, checkMsg: check.message } : {}),
  };
  const saved = existing
    ? await prisma.connector.update({ where: { id: existing.id }, data })
    : await prisma.connector.create({ data: { ownerId: user.id, kind, ...data } });

  const where = p.kind === "mail" ? `${p.config.protocol.toUpperCase()} ${p.config.user}, ${p.config.host}:${p.config.port}` : p.config.url;
  await audit("mcp", `${existing ? "Изменён" : "Добавлен"} коннектор «${saved.name}» (${CONNECTORS[kind].label}: ${where})` +
    (existing && typed ? `, ${secretLabel(kind)} заменён` : "") + (existing && existing.enabled !== enabled ? (enabled ? ", включён" : ", выключен") : !enabled ? ", выключен" : ""), user);
  revalidatePath("/connectors");
  revalidatePath("/agents");
  return { ok: existing ? "Сохранено" : "Коннектор добавлен" };
}

/** Row «Проверить»: checks the saved connector and stores the result as its status. */
export async function checkConnector(id: string): Promise<TestState> {
  const { user, c } = await own(id);
  if (!c) return { ok: false, message: NOT_FOUND };
  let r: TestState;
  try {
    r = c.kind === "mail" ? await connect({ kind: "mail", config: mailAccess(c) }, mailAccess(c).pass)
      : await connect({ kind: "api", config: apiAccess(c) }, apiAccess(c).token ?? "");
  } catch (e) {
    r = { ok: false, message: `✕ ${(e as Error).message}` };
  }
  await prisma.connector.update({ where: { id: c.id }, data: { checkedAt: new Date(), checkOk: r.ok, checkMsg: r.message } });
  await audit("mcp", `Проверка коннектора «${c.name}»: ${r.message}`, user);
  revalidatePath("/connectors");
  return { ok: r.ok, message: r.message };
}

/** Delete a connector; agents and the assistant simply stop seeing it. */
export async function deleteConnector(id: string): Promise<FormState> {
  const { user, c } = await own(id);
  if (!c) return { error: NOT_FOUND };
  await prisma.connector.delete({ where: { id: c.id } });
  await audit("mcp", `Удалён коннектор «${c.name}»`, user);
  revalidatePath("/connectors");
  revalidatePath("/agents");
  return { ok: "Коннектор удалён" };
}
