import "server-only";
import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";

// IMAP access for the «Почта» connector. Settings come from the user's connection (MCP section), not from .env.
// Fetches use BODY.PEEK (imapflow), so reading never marks a letter as read.

export type MailAccess = { host: string; port: number; secure: boolean; user: string; pass: string };

export type FetchedEmail = {
  uid: number;
  messageId: string | null;
  from: string;
  subject: string;
  date: Date | null;
  text: string; // plain text (html stripped if needed)
};

export type MailSummary = { id: number; date: string | null; from: string; subject: string; snippet: string; unread: boolean };
export type MailLetter = { id: number; date: string | null; from: string; to: string; subject: string; text: string; attachments: string[] };

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** A connection error in words a user can act on. */
export function mailError(e: unknown): string {
  const err = e as { authenticationFailed?: boolean; code?: string; message?: string; responseText?: string };
  if (err.authenticationFailed || /auth|login|credentials|LOGIN/i.test(err.responseText ?? "")) return "Неверный логин или пароль приложения";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(err.code ?? "")) return "Почтовый сервер не найден — проверьте адрес";
  if (["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ETIMEOUT"].includes(err.code ?? "") || /timeout/i.test(err.message ?? "")) {
    return "Не удалось подключиться к почтовому серверу — проверьте адрес, порт и SSL";
  }
  return `Ошибка почты: ${(err.message ?? String(e)).slice(0, 200)}`;
}

async function withInbox<T>(acc: MailAccess, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: acc.host, port: acc.port, secure: acc.secure, auth: { user: acc.user, pass: acc.pass },
    logger: false, greetingTimeout: 15_000, socketTimeout: 60_000,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    return await fn(client);
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
}

/** «Проверить»: log in and count the inbox. */
export async function checkMailbox(acc: MailAccess): Promise<{ ok: boolean; message: string }> {
  try {
    const n = await withInbox(acc, async (c) => (c.mailbox ? c.mailbox.exists : 0));
    return { ok: true, message: `✓ Подключено — во входящих писем: ${n}` };
  } catch (e) {
    return { ok: false, message: `✕ ${mailError(e)}` };
  }
}

/** Recent INBOX letters (newest first), optionally filtered by sender — for the receipts agent. */
export async function fetchRecentEmails(acc: MailAccess, opts: { sinceDays?: number; fromFilter?: string; max?: number }): Promise<FetchedEmail[]> {
  const sinceDays = opts.sinceDays ?? 30;
  const max = opts.max ?? 40;
  return withInbox(acc, async (client) => {
    const out: FetchedEmail[] = [];
    const uids = (await client.search({ since: new Date(Date.now() - sinceDays * 86400000) }, { uid: true })) || [];
    const pick = uids.slice(-max).reverse();
    if (pick.length === 0) return out;
    for await (const msg of client.fetch(pick, { source: true }, { uid: true })) {
      const parsed = await simpleParser(msg.source as Buffer);
      const from = parsed.from?.text ?? "";
      if (opts.fromFilter && !from.toLowerCase().includes(opts.fromFilter.toLowerCase())) continue;
      out.push({
        uid: msg.uid, messageId: parsed.messageId ?? null, from, subject: parsed.subject ?? "", date: parsed.date ?? null,
        text: parsed.text?.trim() || (parsed.html ? htmlToText(parsed.html) : ""),
      });
    }
    return out;
  });
}

/** «Искать письма»: newest first; query matches subject, body or sender. */
export async function searchEmails(acc: MailAccess, q: { query?: string; from?: string; days: number; unreadOnly?: boolean; limit: number }) {
  return withInbox(acc, async (client) => {
    const criteria: SearchObject = { since: new Date(Date.now() - q.days * 86400000) };
    if (q.unreadOnly) criteria.seen = false;
    if (q.from) criteria.from = q.from;
    if (q.query) criteria.or = [{ subject: q.query }, { body: q.query }, { from: q.query }];
    const uids = (await client.search(criteria, { uid: true })) || [];
    const pick = uids.slice(-q.limit).reverse();
    const letters: MailSummary[] = [];
    if (pick.length) {
      for await (const msg of client.fetch(pick, { source: true, flags: true }, { uid: true })) {
        const p = await simpleParser(msg.source as Buffer);
        const text = p.text?.trim() || (p.html ? htmlToText(p.html) : "");
        letters.push({
          id: msg.uid, date: p.date?.toISOString() ?? null, from: p.from?.text ?? "", subject: p.subject ?? "",
          snippet: text.replace(/\s+/g, " ").slice(0, 200), unread: !msg.flags?.has("\\Seen"),
        });
      }
      letters.sort((a, b) => b.id - a.id);
    }
    return { total: uids.length, letters };
  });
}

/** «Прочитать письмо»: one letter by its id (IMAP uid), text capped. */
export async function readEmail(acc: MailAccess, id: number): Promise<MailLetter | null> {
  return withInbox(acc, async (client) => {
    const msg = await client.fetchOne(String(id), { source: true }, { uid: true });
    if (!msg || !msg.source) return null;
    const p = await simpleParser(msg.source as Buffer);
    const text = p.text?.trim() || (p.html ? htmlToText(p.html) : "");
    const to = Array.isArray(p.to) ? p.to.map((a) => a.text).join(", ") : p.to?.text ?? "";
    return {
      id, date: p.date?.toISOString() ?? null, from: p.from?.text ?? "", to, subject: p.subject ?? "",
      text: text.length > 6000 ? text.slice(0, 6000) + "\n…(письмо обрезано)" : text,
      attachments: (p.attachments ?? []).map((a) => a.filename ?? "вложение"),
    };
  });
}
