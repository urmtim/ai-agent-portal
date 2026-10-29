import "server-only";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret";
import { parseMailConfig } from "@/lib/connectors";
import type { MailAccess } from "@/lib/mailbox";

/** The user's MCP connections, oldest first (#1, #2…). */
export function ownConnections(userId: string) {
  return prisma.mcpConnection.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "asc" } });
}

/** Mail settings + decrypted password of a «Почта» connection; throws a readable error when unusable. */
export function mailAccess(c: { kind: string; name: string; config: string; secretEnc: string | null }): MailAccess {
  if (c.kind !== "mail") throw new Error(`«${c.name}» — не почта`);
  const cfg = parseMailConfig(c.config);
  if (!cfg) throw new Error(`Подключение «${c.name}» настроено не до конца — откройте его в разделе MCP`);
  const pass = c.secretEnc ? decryptSecret(c.secretEnc) : null;
  if (!pass) throw new Error(`Пароль подключения «${c.name}» не читается — введите его заново в разделе MCP`);
  return { ...cfg, pass };
}

/** First «Почта» connection among the given ids that the user owns, or null. */
export async function firstMailConnection(userId: string, ids: string[]) {
  if (!ids.length) return null;
  const rows = await prisma.mcpConnection.findMany({ where: { ownerId: userId, kind: "mail", id: { in: ids } }, orderBy: { createdAt: "asc" } });
  return rows[0] ?? null;
}
