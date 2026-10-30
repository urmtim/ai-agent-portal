import "server-only";
import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import type { MailConfig } from "@/lib/connectors";
import { withPop3 } from "@/lib/pop3";
import { findSpecial, folderLabel, resolveFolder, specialOf, type FolderInfo, type SpecialUse } from "@/lib/mail-catalog";
import { extractDocText, MAX_DOC_TEXT, tidyText } from "@/lib/guardrail-docs";

// Mail access for the «Почта» connector, over IMAP or POP3, and sending over its SMTP. Settings come from the user's connector, not from .env.
// IMAP fetches use BODY.PEEK (imapflow), so reading never marks a letter as read; POP3 has no «read» mark at all
// and never deletes anything (lib/pop3.ts). A letter's id is its IMAP uid in its folder, or its POP3 number.
// Nothing here deletes for good: «удалить» moves to the trash, and folders are never removed.

export type MailAccess = MailConfig & { pass: string };

/** How far back POP3 looks: it has no server-side search, so only the newest letters are scanned. */
const POP3_SCAN = 200;
/** Attachments bigger than this are not read. */
const MAX_ATTACHMENT = 10 * 1024 * 1024;

export type FetchedEmail = {
  uid: number;
  messageId: string | null;
  from: string;
  subject: string;
  date: Date | null;
  text: string; // plain text (html stripped if needed)
};

export type MailSummary = { id: number; date: string | null; from: string; subject: string; snippet: string; unread: boolean };
export type MailAttachment = { n: number; name: string; size: number };
export type MailLetter = {
  id: number; folder: string; date: string | null; from: string; to: string; cc: string; subject: string; text: string; attachments: MailAttachment[];
};
export type MailFolder = { name: string; path: string; total: number; unread: number };

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** A connection error in words a user can act on. */
export function mailError(e: unknown): string {
  const err = e as { authenticationFailed?: boolean; code?: string; message?: string; responseText?: string; serverResponseCode?: string };
  // nodemailer (SMTP) wraps the socket error: its code is EAUTH / ESOCKET / ECONNECTION, the cause is in the message
  const msg = err.message ?? "";
  if (err.authenticationFailed || err.code === "EAUTH" || /auth|login|credentials|LOGIN/i.test(err.responseText ?? "")) return "Неверный логин или пароль приложения";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(err.code ?? "") || /ENOTFOUND|EAI_AGAIN/.test(msg)) return "Почтовый сервер не найден — проверьте адрес";
  if (["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ETIMEOUT", "ECONNECTION"].includes(err.code ?? "") || /ECONNREFUSED|ECONNRESET|ETIMEDOUT|timeout/i.test(msg)) {
    return "Не удалось подключиться — проверьте сервер и порт";
  }
  // the server refused a change or a send: often an app password that only reads
  if (/NO|READ-?ONLY|permission|denied|not allowed/i.test(err.serverResponseCode ?? "") || /read-?only|permission denied|not allowed/i.test(err.responseText ?? msg)) {
    return "Почта не дала это сделать — проверьте права пароля приложения";
  }
  return `Ошибка почты: ${(err.responseText || msg || String(e)).slice(0, 200)}`;
}

/** A problem the model and the user should read as is (no «Ошибка почты:» prefix). */
export class MailUserError extends Error {}
function fail(text: string): never { throw new MailUserError(text); }

async function withImap<T>(acc: MailAccess, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: acc.host, port: acc.port, secure: acc.secure, auth: { user: acc.user, pass: acc.pass },
    logger: false, greetingTimeout: 15_000, socketTimeout: 60_000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

async function locked<T>(client: ImapFlow, path: string, fn: () => Promise<T>): Promise<T> {
  const lock = await client.getMailboxLock(path);
  try { return await fn(); } finally { lock.release(); }
}

const withInbox = <T,>(acc: MailAccess, fn: (client: ImapFlow) => Promise<T>) => withImap(acc, (c) => locked(c, "INBOX", () => fn(c)));

type Listed = FolderInfo & { delimiter: string; parentPath: string };

/** Selectable folders of the mailbox. */
async function folders(client: ImapFlow): Promise<Listed[]> {
  return (await client.list()).filter((f) => !f.flags.has("\\Noselect") && !f.flags.has("\\NonExistent"))
    .map((f) => ({ path: f.path, name: f.name, specialUse: f.specialUse, delimiter: f.delimiter, parentPath: f.parentPath }));
}

/** The folder a tool was asked for; a readable error lists the folders there are. */
function pick(list: Listed[], asked: string | undefined): Listed {
  const f = resolveFolder(list, asked);
  if (!f) fail(`Папки «${asked}» нет. Папки: ${list.map(folderLabel).join(", ")}`);
  return f as Listed;
}

/** POP3 has only the inbox. */
function pop3Folder(asked: string | undefined) {
  if (!resolveFolder([{ path: "INBOX", name: "INBOX" }], asked)) fail("По POP3 есть только «Входящие»");
}

const NEW_SPECIAL: Partial<Record<SpecialUse, string>> = { "\\Trash": "Trash", "\\Junk": "Junk", "\\Drafts": "Drafts" };

/** A special folder, created when the mailbox has none (some servers have no «Спам» or «Черновики»). */
async function special(client: ImapFlow, list: Listed[], use: SpecialUse): Promise<Listed> {
  const f = findSpecial(list, use);
  if (f) return f as Listed;
  const path = NEW_SPECIAL[use] ?? fail("Такой папки нет");
  await client.mailboxCreate(path as string);
  const made: Listed = { path: path as string, name: path as string, specialUse: use, delimiter: list[0]?.delimiter ?? "/", parentPath: "" };
  list.push(made);
  return made;
}

/** Logs in to the sending server (SMTP) without sending anything. */
const smtpTransport = (acc: MailAccess) => nodemailer.createTransport({
  host: acc.smtpHost, port: acc.smtpPort, secure: acc.smtpSecure, auth: { user: acc.user, pass: acc.pass },
  connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000, tls: { servername: acc.smtpHost },
});

async function checkSmtp(acc: MailAccess) {
  const t = smtpTransport(acc);
  try { await t.verify(); } finally { t.close(); }
}

/** «Сколько писем»: a folder (the inbox by default), and how many are unread (POP3 doesn't know: null). */
export async function countEmails(acc: MailAccess, folder?: string): Promise<{ folder: string; total: number; unread: number | null }> {
  if (acc.protocol === "pop3") { pop3Folder(folder); return { folder: "Входящие", total: await withPop3(acc, (c) => c.count()), unread: null }; }
  return withImap(acc, async (c) => {
    const f = pick(await folders(c), folder);
    const s = await c.status(f.path, { messages: true, unseen: true });
    return { folder: folderLabel(f), total: (s && s.messages) || 0, unread: (s && s.unseen) || 0 };
  });
}

/** «Смотреть папки»: every folder with its letters and unread ones (IMAP only). */
export async function listFolders(acc: MailAccess): Promise<MailFolder[]> {
  if (acc.protocol === "pop3") fail("По POP3 есть только «Входящие»");
  return withImap(acc, async (c) => {
    const out: MailFolder[] = [];
    for (const f of await folders(c)) {
      const s = await c.status(f.path, { messages: true, unseen: true }).catch(() => null);
      out.push({ name: folderLabel(f), path: f.path, total: (s && s.messages) || 0, unread: (s && s.unseen) || 0 });
    }
    // special folders first, in the usual order
    const rank = (m: MailFolder) => { const i = ["Входящие", "Отправленные", "Черновики", "Архив", "Спам", "Корзина"].indexOf(m.name); return i < 0 ? 99 : i; };
    return out.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
  });
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
const addrs = (a: ParsedMail["to"]) => (Array.isArray(a) ? a.map((x) => x.text).join(", ") : a?.text ?? "");

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
    const newest = uids.slice(-max).reverse();
    if (newest.length === 0) return out;
    for await (const msg of client.fetch(newest, { source: true }, { uid: true })) {
      const parsed = await simpleParser(msg.source as Buffer);
      const from = parsed.from?.text ?? "";
      if (opts.fromFilter && !from.toLowerCase().includes(opts.fromFilter.toLowerCase())) continue;
      out.push({ uid: msg.uid, messageId: parsed.messageId ?? null, from, subject: parsed.subject ?? "", date: parsed.date ?? null, text: textOf(parsed) });
    }
    return out;
  });
}

/** «Искать письма»: newest first, in a folder (the inbox by default); query matches subject, body or sender. */
export async function searchEmails(acc: MailAccess, q: { folder?: string; query?: string; from?: string; days: number; unreadOnly?: boolean; limit: number }) {
  if (acc.protocol === "pop3") {
    pop3Folder(q.folder);
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
    return { folder: "Входящие", total, letters };
  }
  return withImap(acc, async (client) => {
    const f = pick(await folders(client), q.folder);
    return locked(client, f.path, async () => {
      const criteria: SearchObject = { since: new Date(Date.now() - q.days * 86400000) };
      if (q.unreadOnly) criteria.seen = false;
      if (q.from) criteria.from = q.from;
      if (q.query) criteria.or = [{ subject: q.query }, { body: q.query }, { from: q.query }];
      const uids = (await client.search(criteria, { uid: true })) || [];
      const ids = uids.slice(-q.limit).reverse();
      const letters: MailSummary[] = [];
      if (ids.length) {
        for await (const msg of client.fetch(ids, { source: true, flags: true }, { uid: true })) {
          const p = await simpleParser(msg.source as Buffer);
          letters.push({
            id: msg.uid, date: p.date?.toISOString() ?? null, from: p.from?.text ?? "", subject: p.subject ?? "",
            snippet: textOf(p).replace(/\s+/g, " ").slice(0, 200), unread: !msg.flags?.has("\\Seen"),
          });
        }
        letters.sort((a, b) => b.id - a.id);
      }
      return { folder: folderLabel(f), total: uids.length, letters };
    });
  });
}

/** One letter's source and its folder's name; null when there is no such letter. */
async function source(acc: MailAccess, id: number, folder?: string): Promise<{ folder: string; src: Buffer } | null> {
  if (acc.protocol === "pop3") {
    pop3Folder(folder);
    const src = await withPop3(acc, async (c) => (id >= 1 && id <= (await c.count()) ? c.retr(id) : null));
    return src ? { folder: "Входящие", src } : null;
  }
  return withImap(acc, async (client) => {
    const f = pick(await folders(client), folder);
    return locked(client, f.path, async () => {
      const msg = await client.fetchOne(String(id), { source: true }, { uid: true });
      return msg && msg.source ? { folder: folderLabel(f), src: msg.source as Buffer } : null;
    });
  });
}

const noLetter = (folder?: string) => fail(`Письма с таким id нет в «${folder || "Входящие"}» — найдите его заново`);

/** «Прочитать письмо»: one letter by its id in a folder, text capped; attachments listed by number. */
export async function readEmail(acc: MailAccess, id: number, folder?: string): Promise<MailLetter | null> {
  const s = await source(acc, id, folder);
  if (!s) return null;
  const p = await simpleParser(s.src);
  const text = textOf(p);
  return {
    id, folder: s.folder, date: p.date?.toISOString() ?? null, from: p.from?.text ?? "", to: addrs(p.to), cc: addrs(p.cc), subject: p.subject ?? "",
    text: text.length > 6000 ? text.slice(0, 6000) + "\n…(письмо обрезано)" : text,
    attachments: (p.attachments ?? []).map((a, i) => ({ n: i + 1, name: a.filename ?? `вложение ${i + 1}`, size: a.size })),
  };
}

/** «Вложения»: the text of attachment `n` of a letter (PDF, Word, text, Markdown, CSV, HTML). */
export async function attachmentText(acc: MailAccess, id: number, n: number, folder?: string): Promise<{ folder: string; name: string; text: string }> {
  const s = await source(acc, id, folder);
  if (!s) return noLetter(folder);
  const p = await simpleParser(s!.src);
  const a = p.attachments?.[n - 1];
  if (!a) fail(`У письма нет вложения №${n}${p.attachments?.length ? `: их ${p.attachments.length}` : ", вложений нет"}`);
  const name = a!.filename ?? `вложение ${n}`, ext = name.toLowerCase().split(".").pop() ?? "", type = a!.contentType.toLowerCase();
  if (a!.size > MAX_ATTACHMENT) fail(`Вложение «${name}» больше 10 МБ — его не читаю`);
  let text: string;
  if (ext === "pdf" || ext === "docx" || type === "application/pdf") {
    // extractDocText goes by the extension; its errors are already in words
    try { text = await extractDocText(ext === "docx" ? "file.docx" : "file.pdf", a!.content); } catch (e) { return fail((e as Error).message); }
  } else if (ext === "html" || ext === "htm" || type === "text/html") text = tidyText(htmlToText(a!.content.toString("utf8")));
  else if (["txt", "md", "csv", "tsv", "json", "xml", "log"].includes(ext) || type.startsWith("text/")) text = tidyText(a!.content.toString("utf8"));
  else return fail(`Этот вид вложения пока не читается: «${name}»`);
  if (!text) fail(`Во вложении «${name}» нет текста`);
  return { folder: s!.folder, name, text: text.length > MAX_DOC_TEXT ? text.slice(0, MAX_DOC_TEXT) + "\n…" : text };
}

// ---- changes (IMAP): all of them can be undone inside the mailbox ----

/** Runs `fn` in a folder on the letters among `ids` that are there; none of them → a readable error. */
async function inFolder<T>(acc: MailAccess, folder: string | undefined, ids: number[], fn: (c: ImapFlow, f: Listed, uids: number[], list: Listed[]) => Promise<T>): Promise<T> {
  if (acc.protocol === "pop3") fail("По POP3 письма не меняются — нужно получение по IMAP");
  return withImap(acc, async (client) => {
    const list = await folders(client);
    const f = pick(list, folder);
    return locked(client, f.path, async () => {
      const found = ((await client.search({ uid: ids.join(",") }, { uid: true })) || []).filter((u) => ids.includes(u));
      if (!found.length) noLetter(folderLabel(f));
      return fn(client, f, found, list);
    });
  });
}

export type MoveResult = { from: string; to: string; count: number };

/** «Перемещать»: letters from one folder to another. */
export async function moveEmails(acc: MailAccess, ids: number[], to: string, folder?: string): Promise<MoveResult> {
  return inFolder(acc, folder, ids, async (c, f, uids, list) => {
    const dest = pick(list, to);
    if (dest.path === f.path) fail(`Письма уже в «${folderLabel(f)}»`);
    await c.messageMove(uids.join(","), dest.path, { uid: true });
    return { from: folderLabel(f), to: folderLabel(dest), count: uids.length };
  });
}

/** «Отмечать»: read / unread and the flag. */
export async function markEmails(acc: MailAccess, ids: number[], mark: { read?: boolean; flagged?: boolean }, folder?: string): Promise<{ folder: string; count: number }> {
  if (mark.read === undefined && mark.flagged === undefined) fail("Скажите, что отметить: прочитано или флажок");
  return inFolder(acc, folder, ids, async (c, f, uids) => {
    const range = uids.join(",");
    for (const [flag, on] of [["\\Seen", mark.read], ["\\Flagged", mark.flagged]] as const) {
      if (on === true) await c.messageFlagsAdd(range, [flag], { uid: true });
      if (on === false) await c.messageFlagsRemove(range, [flag], { uid: true });
    }
    return { folder: folderLabel(f), count: uids.length };
  });
}

/** «Спам»: to the spam folder, or back to the inbox. */
export async function spamEmails(acc: MailAccess, ids: number[], spam: boolean, folder?: string): Promise<MoveResult> {
  return inFolder(acc, folder, ids, async (c, f, uids, list) => {
    const dest = spam ? await special(c, list, "\\Junk") : pick(list, undefined);
    if (dest.path === f.path) fail(spam ? "Письма уже в «Спаме»" : "Письма уже во «Входящих»");
    await c.messageMove(uids.join(","), dest.path, { uid: true });
    return { from: folderLabel(f), to: folderLabel(dest), count: uids.length };
  });
}

/** «Удалять в корзину»: never for good — a letter already in the trash stays there. */
export async function trashEmails(acc: MailAccess, ids: number[], folder?: string): Promise<MoveResult> {
  return inFolder(acc, folder, ids, async (c, f, uids, list) => {
    if (specialOf(f) === "\\Trash") fail("Письма уже в «Корзине»; насовсем портал не удаляет");
    const dest = await special(c, list, "\\Trash");
    await c.messageMove(uids.join(","), dest.path, { uid: true });
    return { from: folderLabel(f), to: folderLabel(dest), count: uids.length };
  });
}

/** «Создавать папки»: a new folder, or a new name for one (special folders keep theirs). */
export async function makeFolder(acc: MailAccess, name: string, rename?: string): Promise<{ name: string; renamed?: string }> {
  if (acc.protocol === "pop3") fail("По POP3 папок нет — нужно получение по IMAP");
  const clean = name.trim();
  if (!clean) fail("Укажите название папки");
  return withImap(acc, async (client) => {
    const list = await folders(client);
    if (resolveFolder(list, clean)) fail(`Папка «${clean}» уже есть`);
    if (rename) {
      const f = pick(list, rename);
      if (specialOf(f)) fail(`«${folderLabel(f)}» — служебная папка, её не переименовать`);
      const path = f.parentPath ? `${f.parentPath}${f.delimiter}${clean}` : clean;
      await client.mailboxRename(f.path, path);
      return { name: clean, renamed: folderLabel(f) };
    }
    await client.mailboxCreate(clean);
    return { name: clean };
  });
}

// ---- writing letters ----

export type Draft = { to: string; cc?: string; subject: string; text: string };

/** Who to answer and the headers of a reply to letter `id`. */
async function replyTo(acc: MailAccess, id: number, all: boolean, folder?: string) {
  const s = await source(acc, id, folder);
  if (!s) return noLetter(folder);
  const p = await simpleParser(s!.src);
  const me = senderOf(acc).toLowerCase();
  const list = (a: ParsedMail["to"]) => (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value).map((v) => v.address ?? "").filter((x) => x && x.toLowerCase() !== me);
  const to = list(p.replyTo ?? p.from)[0] ?? p.from?.value[0]?.address ?? "";
  const cc = all ? [...new Set([...list(p.to), ...list(p.cc)].filter((x) => x !== to))] : [];
  const subject = /^re:/i.test(p.subject ?? "") ? p.subject! : `Re: ${p.subject ?? ""}`.trim();
  const quote = `\n\n${p.date ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Moscow" }).format(p.date) : ""}, ${p.from?.text ?? ""}:\n` +
    textOf(p).split("\n").map((l) => `> ${l}`).join("\n");
  const refs = [...(Array.isArray(p.references) ? p.references : p.references ? [p.references] : []), ...(p.messageId ? [p.messageId] : [])];
  return { to, cc: cc.join(", "), subject, quote, inReplyTo: p.messageId, references: refs, parsed: p };
}

/** «Черновики»: a letter put into the drafts folder (a reply when `reply` is given); nothing is sent. */
export async function saveDraft(acc: MailAccess, d: Partial<Draft> & { text: string; reply?: { id: number; folder?: string; all?: boolean } }): Promise<{ to: string; subject: string; folder: string }> {
  if (acc.protocol === "pop3") fail("По POP3 черновиков нет — нужно получение по IMAP");
  const r = d.reply ? await replyTo(acc, d.reply.id, !!d.reply.all, d.reply.folder) : null;
  const to = d.to?.trim() || r?.to || "";
  const subject = d.subject?.trim() || r?.subject || "";
  const raw = await new MailComposer({
    from: senderOf(acc), to: to || undefined, cc: d.cc || r?.cc || undefined, subject, text: d.text + (r ? r.quote : ""),
    inReplyTo: r?.inReplyTo, references: r?.references,
  }).compile().build();
  return withImap(acc, async (client) => {
    const dest = await special(client, await folders(client), "\\Drafts");
    await client.append(dest.path, raw, ["\\Draft", "\\Seen"]);
    return { to, subject, folder: folderLabel(dest) };
  });
}

/** The sender's address: the login, or login@domain when the login has none (Yandex lets you log in as «ivan»). */
export const senderOf = (acc: Pick<MailAccess, "user" | "host">) =>
  acc.user.includes("@") ? acc.user : `${acc.user}@${acc.host.replace(/^(imap|pop3?|mail)\./i, "")}`;

async function send(acc: MailAccess, mail: nodemailer.SendMailOptions) {
  if (!acc.smtpHost) fail("Отправка не настроена — в коннекторе выберите «Отправка — SMTP»");
  const t = smtpTransport(acc);
  try { await t.sendMail({ from: senderOf(acc), ...mail }); } finally { t.close(); }
}

/** «Отправлять письма»: a new letter from the connector's login. */
export async function sendEmail(acc: MailAccess, d: Draft): Promise<{ to: string; subject: string }> {
  if (!d.to.trim()) fail("Укажите, кому отправить");
  await send(acc, { to: d.to, cc: d.cc || undefined, subject: d.subject, text: d.text });
  return { to: d.to, subject: d.subject };
}

/** «Отвечать»: to the sender (or everyone), «Re: » and the original quoted. */
export async function replyEmail(acc: MailAccess, id: number, text: string, all: boolean, folder?: string): Promise<{ to: string; subject: string }> {
  const r = await replyTo(acc, id, all, folder);
  if (!r.to) fail("У письма нет адреса для ответа");
  await send(acc, { to: r.to, cc: r.cc || undefined, subject: r.subject, text: text + r.quote, inReplyTo: r.inReplyTo, references: r.references });
  return { to: [r.to, r.cc].filter(Boolean).join(", "), subject: r.subject };
}

/** «Пересылать»: «Fwd: », the original text and all of its attachments. */
export async function forwardEmail(acc: MailAccess, id: number, to: string, text: string, folder?: string): Promise<{ to: string; subject: string; attachments: number }> {
  if (!to.trim()) fail("Укажите, кому переслать");
  const s = await source(acc, id, folder);
  if (!s) return noLetter(folder);
  const p = await simpleParser(s!.src);
  const subject = /^fwd?:/i.test(p.subject ?? "") ? p.subject! : `Fwd: ${p.subject ?? ""}`.trim();
  const head = ["---------- Пересланное письмо ----------", `От: ${p.from?.text ?? ""}`, `Дата: ${p.date?.toISOString() ?? ""}`, `Тема: ${p.subject ?? ""}`, `Кому: ${addrs(p.to)}`].join("\n");
  const attachments = (p.attachments ?? []).map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType }));
  await send(acc, { to, subject, text: `${text ? text + "\n\n" : ""}${head}\n\n${textOf(p)}`, attachments });
  return { to, subject, attachments: attachments.length };
}
