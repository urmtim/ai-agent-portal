import "server-only";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret";
import { parseApiConfig, parseMailConfig, apiCheckMessage, type ApiConfig } from "@/lib/connectors";
import type { MailAccess } from "@/lib/mailbox";
import type { AccessInfo } from "@/lib/chat/policy-tools";
import { availableMailTools, mailGives, parseToolsOff, type MailAbility } from "@/lib/mail-catalog";
import { limitsText, parseLimits } from "@/lib/mail-limits";

type Row = { kind: string; name: string; config: string; secretEnc: string | null; limits?: string };

/** The user's connectors, oldest first (#1, #2…). */
export function ownConnectors(userId: string) {
  return prisma.connector.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "asc" } });
}

/** Mail settings + decrypted password of a «Почта» connector; throws a readable error when unusable. */
export function mailAccess(c: Row): MailAccess {
  if (c.kind !== "mail") throw new Error(`«${c.name}» — не почта`);
  const cfg = parseMailConfig(c.config);
  if (!cfg) throw new Error(`Коннектор «${c.name}» настроен не до конца — откройте его в разделе «Коннекторы»`);
  const pass = c.secretEnc ? decryptSecret(c.secretEnc) : null;
  if (!pass) throw new Error(`Пароль коннектора «${c.name}» не читается — введите его заново в разделе «Коннекторы»`);
  return { ...cfg, pass, limits: parseLimits(c.limits) };
}

/** Address + decrypted token (null: none) of an «API» connector. */
export function apiAccess(c: Row): ApiConfig & { token: string | null } {
  const cfg = parseApiConfig(c.config);
  if (c.kind !== "api" || !cfg) throw new Error(`Коннектор «${c.name}» настроен не до конца — откройте его в разделе «Коннекторы»`);
  return { ...cfg, token: c.secretEnc ? decryptSecret(c.secretEnc) : null };
}

/** «Проверить» an API: GET the address, with the token when there is one. */
export async function checkApi(a: { url: string; token: string | null }): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await fetch(a.url, {
      headers: a.token ? { Authorization: `Bearer ${a.token}` } : {}, redirect: "manual", signal: AbortSignal.timeout(15_000),
    });
    await r.body?.cancel().catch(() => {});
    return apiCheckMessage(r.status);
  } catch {
    return apiCheckMessage(null);
  }
}

/** What a mail connector's connection allows (null: not set up). */
function abilityOf(c: { config: string }): MailAbility | null {
  const m = parseMailConfig(c.config);
  return m ? { protocol: m.protocol, smtp: !!m.smtpHost } : null;
}

/** The model's tool names a «Почта» connector gives: switched on on its «Инструменты» tab and allowed by its connection. */
export function connectorMailTools(c: { config: string; toolsOff: string } | null): string[] {
  const a = c ? abilityOf(c) : null;
  return a ? availableMailTools(a, parseToolsOff(c!.toolsOff)) : [];
}

/**
 * What get_policies tells the model about its own setup: the model and the switched-on connectors among `ids`.
 * `mailId` — the mailbox the mail tools work on (the first switched-on one). No logins: they would be masked anyway.
 */
export async function accessInfo(userId: string, modelId: string | null, ids: string[], mailId: string | null): Promise<AccessInfo> {
  const [m, rows] = await Promise.all([
    modelId ? prisma.llmModel.findFirst({ where: { id: modelId, ownerId: userId }, select: { name: true, model: true, baseUrl: true } }) : null,
    ids.length ? prisma.connector.findMany({ where: { ownerId: userId, enabled: true, id: { in: ids } }, orderBy: { createdAt: "asc" } }) : [],
  ]);
  const mailName = rows.find((c) => c.id === mailId)?.name;
  return {
    model: m ? { name: m.name, model: m.model, server: m.baseUrl.replace(/^https?:\/\//, "").split("/")[0] } : null,
    connectors: rows.map((c) => {
      if (c.kind === "mail") {
        const cfg = parseMailConfig(c.config);
        return {
          name: c.name, type: "Почта", server: cfg ? `${cfg.protocol.toUpperCase()} ${cfg.host}` : "",
          ...(c.id === mailId && cfg ? { limits: limitsText(parseLimits(c.limits), cfg.protocol) } : {}),
          gives: c.id !== mailId ? `ничего: почтовые инструменты работают с «${mailName}»` : cfg ? mailGives({ protocol: cfg.protocol, smtp: !!cfg.smtpHost }, parseToolsOff(c.toolsOff)) : "ничего: настроен не до конца",
        };
      }
      const api = parseApiConfig(c.config);
      return { name: c.name, type: "API", server: api ? api.url.replace(/^https?:\/\//, "").split("/")[0] : "", gives: "пока ничего: агенты API не используют" };
    }),
  };
}

/** First switched-on «Почта» connector among the given ids that the user owns, or null. */
export async function firstMailConnector(userId: string, ids: string[]) {
  if (!ids.length) return null;
  const rows = await prisma.connector.findMany({ where: { ownerId: userId, kind: "mail", enabled: true, id: { in: ids } }, orderBy: { createdAt: "asc" } });
  return rows[0] ?? null;
}
