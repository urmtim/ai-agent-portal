import "server-only";
import { tool } from "ai";
import { z } from "zod";
import type { Connector } from "@prisma/client";
import { audit, type AuditActor } from "@/lib/audit";
import type { AuditChannel } from "@/lib/audit-events";
import { mailAccess } from "@/lib/connections";
import { mailError, readEmail, searchEmails, type MailLetter, type MailSummary } from "@/lib/mailbox";
import { maskDeep } from "@/lib/agents/guardrails";

// mail_search / mail_read over one «Почта» connector (IMAP or POP3) — shared by the chat assistant and custom agents.

export type MailSearchResult = { mailbox: string; total: number; letters: MailSummary[] } | { error: string };
export type MailReadResult = { mailbox: string; letter: MailLetter } | { error: string };

export type MailToolsOptions = {
  conn: Connector | null;
  /** Who reads, for the journal: «Ассистент», «Агент «Сводка»»… */
  who: string;
  actor: AuditActor;
  channel: AuditChannel;
  /** Personal data in letters replaced by labels before the model sees them (agent guardrail). */
  mask?: boolean;
  /** Error when there is no mailbox. */
  missing?: string;
};

const readable = (e: unknown) =>
  e instanceof Error && /не добавлена|не читается|не до конца/.test(e.message) ? e.message : mailError(e);

export function mailTools({ conn, who, actor, channel, mask = false, missing = "Почта не добавлена" }: MailToolsOptions) {
  const mail = () => {
    if (!conn) throw new Error(missing);
    return mailAccess(conn);
  };
  const out = <T,>(v: T): T => (mask ? maskDeep(v) : v);

  return {
    mail_search: tool({
      description: "Искать письма в почте пользователя (только чтение). Без запроса — просто последние письма за период. Возвращает id, дату, отправителя, тему и начало текста.",
      inputSchema: z.object({
        query: z.string().max(200).optional().describe("Слова для поиска в теме, тексте или отправителе"),
        from: z.string().max(200).optional().describe("Часть адреса или имени отправителя"),
        days: z.number().int().min(1).max(90).describe("За сколько последних дней, обычно 1–7"),
        unreadOnly: z.boolean().optional().describe("Только непрочитанные"),
        limit: z.number().int().min(1).max(20).optional().describe("Сколько писем вернуть, по умолчанию 10"),
      }),
      execute: async (q): Promise<MailSearchResult> => {
        try {
          const r = await searchEmails(mail(), { ...q, limit: q.limit ?? 10 });
          await audit("tool", `${who} искал письма в «${conn!.name}» за ${q.days} дн.: найдено ${r.total}`, actor, channel);
          return out({ mailbox: conn!.name, ...r });
        } catch (e) {
          return { error: readable(e) };
        }
      },
    }),
    mail_read: tool({
      description: "Прочитать одно письмо целиком по его id из mail_search. Письмо не помечается прочитанным.",
      inputSchema: z.object({ id: z.number().int().positive().describe("id письма из mail_search") }),
      execute: async ({ id }): Promise<MailReadResult> => {
        try {
          const letter = await readEmail(mail(), id);
          if (!letter) return { error: "Такого письма нет" };
          await audit("tool", `${who} открыл письмо в «${conn!.name}»`, actor, channel);
          return out({ mailbox: conn!.name, letter });
        } catch (e) {
          return { error: readable(e) };
        }
      },
    }),
  };
}
