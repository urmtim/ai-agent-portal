import net from "node:net";
import tls from "node:tls";

// A small POP3 client for the «Почта» connector: log in, count, read headers (TOP) and whole letters (RETR).
// It never sends DELE, so nothing is removed from the mailbox. Text is kept as latin1 so the letter's bytes survive
// for mailparser. takeResponse is pure and unit-tested (pop3.test.ts).

export type Pop3Reply = { ok: boolean; text: string; lines: string[] };

/** One reply from the head of the buffer, or null while it is incomplete. Multi-line replies end with «.»; «..» is unstuffed. */
export function takeResponse(buf: string, multi: boolean): { reply: Pop3Reply; rest: string } | null {
  const eol = buf.indexOf("\r\n");
  if (eol < 0) return null;
  const first = buf.slice(0, eol);
  const ok = first.startsWith("+OK");
  const text = first.replace(/^(\+OK|-ERR)\s?/, "");
  if (!ok || !multi) return { reply: { ok, text, lines: [] }, rest: buf.slice(eol + 2) };
  const end = buf.indexOf("\r\n.\r\n", eol);
  if (end < 0) return null;
  const body = end === eol ? [] : buf.slice(eol + 2, end).split("\r\n");
  return { reply: { ok, text, lines: body.map((l) => (l.startsWith("..") ? l.slice(1) : l)) }, rest: buf.slice(end + 5) };
}

export type Pop3Access = { host: string; port: number; secure: boolean; user: string; pass: string };

/** An error the mailbox code turns into words (lib/mailbox.ts mailError). */
class Pop3Error extends Error {
  constructor(message: string, readonly authenticationFailed = false) { super(message); }
}

export class Pop3Client {
  private buf = "";
  private waiting: { multi: boolean; resolve: (r: Pop3Reply) => void; reject: (e: Error) => void } | null = null;
  private failure: Error | null = null;

  private constructor(private sock: net.Socket) {
    sock.setEncoding("latin1");
    sock.on("data", (d: string) => { this.buf += d; this.pump(); });
    sock.on("error", (e) => this.fail(e));
    sock.on("timeout", () => { const e = Object.assign(new Error("POP3 timeout"), { code: "ETIMEDOUT" }); this.fail(e); sock.destroy(); });
    sock.on("close", () => this.fail(new Error("Соединение с почтовым сервером закрыто")));
  }

  private fail(e: Error) {
    this.failure ??= e;
    const w = this.waiting;
    this.waiting = null;
    w?.reject(e);
  }

  private pump() {
    if (!this.waiting) return;
    const got = takeResponse(this.buf, this.waiting.multi);
    if (!got) return;
    this.buf = got.rest;
    const w = this.waiting;
    this.waiting = null;
    w.resolve(got.reply);
  }

  private read(multi: boolean): Promise<Pop3Reply> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => { this.waiting = { multi, resolve, reject }; this.pump(); });
  }

  /** Sends a command and waits for its reply; -ERR becomes an error unless `soft`. */
  private async cmd(line: string, multi = false, soft = false): Promise<Pop3Reply> {
    this.sock.write(line + "\r\n", "latin1");
    const r = await this.read(multi);
    if (!r.ok && !soft) throw new Pop3Error(`POP3: ${r.text || line.split(" ")[0]}`);
    return r;
  }

  static async connect(acc: Pop3Access): Promise<Pop3Client> {
    const sock = acc.secure
      ? tls.connect({ host: acc.host, port: acc.port, servername: net.isIP(acc.host) ? undefined : acc.host })
      : net.connect({ host: acc.host, port: acc.port });
    sock.setTimeout(30_000);
    const c = new Pop3Client(sock);
    try {
      const hello = await c.read(false);
      if (!hello.ok) throw new Pop3Error(`POP3: ${hello.text}`);
      await c.cmd(`USER ${acc.user}`, false, true);
      const pass = await c.cmd(`PASS ${acc.pass}`, false, true);
      if (!pass.ok) throw new Pop3Error(pass.text || "authentication failed", true);
      return c;
    } catch (e) {
      sock.destroy();
      throw e;
    }
  }

  /** How many letters are in the mailbox. */
  async count(): Promise<number> {
    const r = await this.cmd("STAT");
    return Number(r.text.split(" ")[0]) || 0;
  }

  /** Headers and the first `lines` lines of letter n, as raw bytes for mailparser. */
  async top(n: number, lines: number): Promise<Buffer> {
    const r = await this.cmd(`TOP ${n} ${lines}`, true);
    return Buffer.from(r.lines.join("\r\n") + "\r\n", "latin1");
  }

  /** The whole letter n; null when there is no such letter. */
  async retr(n: number): Promise<Buffer | null> {
    const r = await this.cmd(`RETR ${n}`, true, true);
    return r.ok ? Buffer.from(r.lines.join("\r\n") + "\r\n", "latin1") : null;
  }

  async quit() {
    try { await this.cmd("QUIT", false, true); } catch { /* closing anyway */ }
    this.sock.destroy();
  }
}

/** Opens a session, runs fn, always says QUIT. */
export async function withPop3<T>(acc: Pop3Access, fn: (c: Pop3Client) => Promise<T>): Promise<T> {
  const c = await Pop3Client.connect(acc);
  try {
    return await fn(c);
  } finally {
    await c.quit();
  }
}
