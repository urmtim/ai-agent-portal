import "server-only";
import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import nodemailer from "nodemailer";
import type { MailConfig } from "@/lib/connectors";
import { withPop3 } from "@/lib/pop3";

// Mail access for the «Почта» connector, over IMAP or POP3. Settings come from the user's connector, not from .env.
// IMAP fetches use BODY.PEEK (imapflow), so reading never marks a letter as read; POP3 has no «read» mark at all
// and never deletes anything (lib/pop3.ts). A letter's id is its IMAP uid or its POP3 number.

export type MailAccess = MailConfig & { pass: string };

/** How far back POP3 looks: it has no server-side search, so only the newest letters are scanned. */
const POP3_SCAN = 200;

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
  // nodemailer (SMTP) wraps the socket error: its code is EAUTH / ESOCKET / ECONNECTION, the cause is in the message
  const msg = err.message ?? "";
  if (err.authenticationFailed || err.code === "EAUTH" || /auth|login|credentials|LOGIN/i.test(err.responseText ?? "")) return "Неверный логин или пароль приложения";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(err.code ?? "") || /ENOTFOUND|EAI_AGAIN/.test(msg)) return "Почтовый сервер не найден — проверьте адрес";
  if (["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ETIMEOUT", "ECONNECTION"].includes(err.code ?? "") || /ECONNREFUSED|ECONNRESET|ETIMEDOUT|timeout/i.test(msg)) {
    return "Не удалось подключиться — проверьте сервер и порт";
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

/** Logs in to the sending server (SMTP) without sending anything. */
async function checkSmtp(acc: MailAccess) {
  const t = nodemailer.createTransport({
    host: acc.smtpHost, port: acc.smtpPort, secure: acc.smtpSecure, auth: { user: acc.user, pass: acc.pass },
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000, tls: { servername: acc.smtpHost },
  });
  try { await t.verify(); } finally { t.close(); }
}

/** «Сколько писем»: the whole inbox, and how many are unread (POP3 doesn't know: null). */
export async function countEmails(acc: MailAccess): Promise<{ total: number; unread: number | null }> {
  if (acc.protocol === "pop3") return { total: await withPop3(acc, (c) => c.count()), unread: null };
  return withInbox(acc, async (c) => ({
    total: c.mailbox ? c.mailbox.exists : 0,
    unread: ((await c.search({ seen: false }, { uid: true })) || []).length,
  }));
}

/** «Проверить»: log in, count the inbox, and log in to SMTP when it is set. `where` says which field a failure belongs to. */
export async function checkMailbox(acc: MailAccess): Promise<{ ok: boolean; message: string; where?: "incoming" | "smtp" }> {
  let n: number;
  try {
    n = acc.protocol === "pop3" ? await withPop3(acc, (c) => c.count()) : await withInbox(acc, async (c) => (c.mailbox ? c.mailbox.exists : 0));
  } catch (e) {
    return { ok: false, message: `✕ ${mailError(e)}`, where: "incoming" };
  }
  if (acc.smtpHost) {
    try { await checkSmtp(acc); } catch (e) { return { ok: false, message: `✕ Отправка: ${mailError(e)}`, where: "smtp" }; }
  }
  return { ok: true, message: `✓ Подключено. Писем во входящих: ${n}` };
}

const textOf = (p: ParsedMail) => p.text?.trim() || (p.html ? htmlToText(p.html) : "");

/** POP3: the newest letters' headers, newest first, until `since`; letters are numbered 1…count in arrival order. */
async function pop3Scan(acc: MailAccess, since: Date, fn: (n: number, head: ParsedMail, more: (lines: number) => Promise<ParsedMail>) => Promise<boolean | void>) {
  await withPop3(acc, async (c) => {
    const count = await c.count();
    for (let n = count; n >= 1 && n > count - POP3_SCAN; n--) {
      const head = await simpleParser(await c.top(n, 0));
      if (head.date && head.date < since) break;
      if ((await fn(n, head, async (lines) => simpleParser(await c.top(n, lines)))) === false) break;
    }
  });
}

/** Recent INBOX letters (newest first), optionally filtered by sender — for the receipts agent. */
export async function fetchRecentEmails(acc: MailAccess, opts: { sinceDays?: number; fromFilter?: string; max?: number }): Promise<FetchedEmail[]> {
  const sinceDays = opts.sinceDays ?? 30;
  const max = opts.max ?? 40;
  if (acc.protocol === "pop3") {
    const out: FetchedEmail[] = [];
    await pop3Scan(acc, new Date(Date.now() - sinceDays * 86400000), async (n, head, more) => {
      const from = head.from?.text ?? "";
      if (opts.fromFilter && !from.toLowerCase().includes(opts.fromFilter.toLowerCase())) return;
      const p = await more(400);
      out.push({ uid: n, messageId: head.messageId ?? null, from, subject: head.subject ?? "", date: head.date ?? null, text: textOf(p) });
      return out.length < max;
    });
    return out;
  }
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
  if (acc.protocol === "pop3") {
    // no server-side search and no «unread» mark: headers of the newest letters, matched here
    const has = (s: string, part?: string) => !part || s.toLowerCase().includes(part.toLowerCase());
    const letters: MailSummary[] = [];
    let total = 0;
    await pop3Scan(acc, new Date(Date.now() - q.days * 86400000), async (n, head, more) => {
      const from = head.from?.text ?? "", subject = head.subject ?? "";
      if (!has(from, q.from) || !(has(subject, q.query) || has(from, q.query))) return;
      total++;
      if (letters.length >= q.limit) return;
      const text = textOf(await more(40));
      letters.push({ id: n, date: head.date?.toISOString() ?? null, from, subject, snippet: text.replace(/\s+/g, " ").slice(0, 200), unread: false });
    });
    return { total, letters };
  }
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
        const text = textOf(p);
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

/** «Прочитать письмо»: one letter by its id (IMAP uid or POP3 number), text capped. */
export async function readEmail(acc: MailAccess, id: number): Promise<MailLetter | null> {
  const source = acc.protocol === "pop3"
    ? await withPop3(acc, (c) => c.retr(id))
    : await withInbox(acc, async (client) => {
      const msg = await client.fetchOne(String(id), { source: true }, { uid: true });
      return msg && msg.source ? (msg.source as Buffer) : null;
    });
  if (!source) return null;
  const p = await simpleParser(source);
  const text = textOf(p);
  const to = Array.isArray(p.to) ? p.to.map((a) => a.text).join(", ") : p.to?.text ?? "";
  return {
    id, date: p.date?.toISOString() ?? null, from: p.from?.text ?? "", to, subject: p.subject ?? "",
    text: text.length > 6000 ? text.slice(0, 6000) + "\n…(письмо обрезано)" : text,
    attachments: (p.attachments ?? []).map((a) => a.filename ?? "вложение"),
  };
}
