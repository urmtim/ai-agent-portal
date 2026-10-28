import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export type FetchedEmail = {
  uid: number;
  messageId: string | null;
  from: string;
  subject: string;
  date: Date | null;
  text: string; // plain text (html stripped if needed)
};

export function imapConfigured(): boolean {
  return !!(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASSWORD);
}

function getConfig() {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error("Почта не настроена: задайте IMAP_HOST, IMAP_USER, IMAP_PASSWORD в .env");
  }
  return { host, user, pass, port: Number(process.env.IMAP_PORT ?? 993) };
}

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

/** Fetch recent INBOX messages (newest first), optionally filtered by sender. */
export async function fetchRecentEmails(opts: {
  sinceDays?: number;
  fromFilter?: string; // substring match on the From header
  max?: number;
}): Promise<FetchedEmail[]> {
  const cfg = getConfig();
  const sinceDays = opts.sinceDays ?? 30;
  const max = opts.max ?? 40;

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });

  const out: FetchedEmail[] = [];
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const since = new Date(Date.now() - sinceDays * 86400000);
    const uids = (await client.search({ since }, { uid: true })) || [];
    // newest first, capped
    const pick = uids.slice(-max).reverse();
    if (pick.length > 0) {
      for await (const msg of client.fetch(pick, { source: true }, { uid: true })) {
        const parsed = await simpleParser(msg.source as Buffer);
        const from = parsed.from?.text ?? "";
        if (opts.fromFilter && !from.toLowerCase().includes(opts.fromFilter.toLowerCase())) {
          continue;
        }
        const text = parsed.text?.trim() || (parsed.html ? htmlToText(parsed.html) : "");
        out.push({
          uid: msg.uid,
          messageId: parsed.messageId ?? null,
          from,
          subject: parsed.subject ?? "",
          date: parsed.date ?? null,
          text,
        });
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return out;
}
