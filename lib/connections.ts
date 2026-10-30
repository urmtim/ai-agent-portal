import "server-only";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret";
import { parseApiConfig, parseMailConfig, apiCheckMessage, type ApiConfig } from "@/lib/connectors";
import type { MailAccess } from "@/lib/mailbox";

type Row = { kind: string; name: string; config: string; secretEnc: string | null };

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
  return { ...cfg, pass };
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

/** First switched-on «Почта» connector among the given ids that the user owns, or null. */
export async function firstMailConnector(userId: string, ids: string[]) {
  if (!ids.length) return null;
  const rows = await prisma.connector.findMany({ where: { ownerId: userId, kind: "mail", enabled: true, id: { in: ids } }, orderBy: { createdAt: "asc" } });
  return rows[0] ?? null;
}
