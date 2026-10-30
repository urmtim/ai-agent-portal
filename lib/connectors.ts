// Connector types and the pure parts of connector settings (unit-tested in connectors.test.ts).
// A connector only keeps where to connect and how to log in: a mailbox (IMAP or POP3, plus SMTP) or an HTTP API.

export const CONNECTORS = {
  mail: { label: "Почта" },
  api: { label: "API" },
} as const;

export type ConnectorKind = keyof typeof CONNECTORS;

export function isConnectorKind(k: string): k is ConnectorKind {
  return Object.prototype.hasOwnProperty.call(CONNECTORS, k);
}

export type MailProtocol = "imap" | "pop3";

/** The usual SSL ports; changing IMAP ↔ POP3 in the window switches to the other one. */
export const MAIL_PORTS = { imap: 993, pop3: 995, smtp: 465 } as const;

/** SSL is on for the SSL ports (993, 995, 465) and off for the rest (143, 110, 587, test servers…). */
export const sslPort = (port: number) => port === 993 || port === 995 || port === 465;

export type MailConfig = {
  protocol: MailProtocol; host: string; port: number; secure: boolean; user: string;
  /** Sending (SMTP), "" when not set; only checked for now. */
  smtpHost: string; smtpPort: number; smtpSecure: boolean;
};
export type ApiConfig = { url: string };

const isHost = (h: string) => /^[a-z0-9.-]+\.[a-z]{2,}$|^localhost$|^\d{1,3}(\.\d{1,3}){3}$/.test(h);
const isPort = (p: number) => Number.isInteger(p) && p >= 1 && p <= 65535;

/** Stored JSON → mail settings, or null when unusable. Rows from the «MCP» days ({host, port, secure, user}) read as IMAP. */
export function parseMailConfig(raw: string | null | undefined): MailConfig | null {
  let v: unknown;
  try { v = JSON.parse(raw || "{}"); } catch { return null; }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const host = str(o.host), user = str(o.user), port = Number(o.port);
  if (!host || !user || !isPort(port)) return null;
  const smtpHost = str(o.smtpHost), smtpPort = Number(o.smtpPort) || MAIL_PORTS.smtp;
  return {
    protocol: o.protocol === "pop3" ? "pop3" : "imap", host, port, user,
    secure: typeof o.secure === "boolean" ? o.secure : sslPort(port),
    smtpHost, smtpPort, smtpSecure: typeof o.smtpSecure === "boolean" ? o.smtpSecure : sslPort(smtpPort),
  };
}

export function parseApiConfig(raw: string | null | undefined): ApiConfig | null {
  try {
    const o = JSON.parse(raw || "{}") as Record<string, unknown>;
    return typeof o.url === "string" && o.url.trim() ? { url: o.url.trim() } : null;
  } catch { return null; }
}

/** Which window field a problem belongs to. */
import type { MailLimitKey } from "./mail-limits";

/** A field of the window; `limit:…` — one on the «Лимиты» tab. */
export type ConnectorField = `limit:${MailLimitKey}` | "kind" | "name" | "host" | "port" | "smtpHost" | "smtpPort" | "user" | "password" | "url" | "token";
export type FieldError = { field: ConnectorField; error: string };

/** «Отправка» in the window: none (a read-only app password is enough) or SMTP with its server and port. */
export type MailSending = "none" | "smtp";

/** Window fields → mail settings; the first problem from top to bottom otherwise. Without sending the SMTP fields are ignored. */
export function mailConfigFromForm(f: { protocol: string; host: string; port: string; sending: string; smtpHost: string; smtpPort: string; user: string }): MailConfig | FieldError {
  const smtp = f.sending === "smtp";
  const host = f.host.trim().toLowerCase(), smtpHost = smtp ? f.smtpHost.trim().toLowerCase() : "", user = f.user.trim();
  const port = Number(f.port), smtpPort = smtp && f.smtpPort.trim() ? Number(f.smtpPort) : MAIL_PORTS.smtp;
  if (!host) return { field: "host", error: "Укажите сервер входящей почты" };
  if (!isHost(host)) return { field: "host", error: "Укажите адрес сервера, например imap.mail.ru" };
  if (!f.port.trim()) return { field: "port", error: "Укажите порт" };
  if (!isPort(port)) return { field: "port", error: "Порт — число от 1 до 65535" };
  if (smtp && !smtpHost) return { field: "smtpHost", error: "Укажите сервер исходящей почты" };
  if (smtp && !isHost(smtpHost)) return { field: "smtpHost", error: "Укажите адрес сервера, например smtp.mail.ru" };
  if (smtp && !f.smtpPort.trim()) return { field: "smtpPort", error: "Укажите порт" };
  if (!isPort(smtpPort)) return { field: "smtpPort", error: "Порт — число от 1 до 65535" };
  if (!user) return { field: "user", error: "Укажите логин" };
  return {
    protocol: f.protocol === "pop3" ? "pop3" : "imap", host, port, secure: sslPort(port), user,
    smtpHost, smtpPort, smtpSecure: sslPort(smtpPort),
  };
}

/** Window fields → API settings. */
export function apiConfigFromForm(f: { url: string }): ApiConfig | FieldError {
  const url = f.url.trim();
  if (!url) return { field: "url", error: "Укажите адрес API" };
  if (!/^https?:\/\/[^\s/]+/i.test(url)) return { field: "url", error: "Адрес должен начинаться с http:// или https://" };
  return { url };
}

/** IMAP ↔ POP3 in the window: the usual port, and imap.… ↔ pop.… when the server follows that pattern. */
export function switchProtocol(host: string, to: MailProtocol): { host: string; port: number } {
  const h = to === "pop3" ? host.replace(/^imap\./i, "pop.") : host.replace(/^pop3?\./i, "imap.");
  return { host: h, port: MAIL_PORTS[to] };
}

/** A connector's line under its name: its description, else what it is («Почта, me@mail.ru»). */
export function connectorDesc(c: { kind: string; description: string; config: string }): string {
  if (c.description.trim()) return c.description.trim();
  if (c.kind === "mail") { const m = parseMailConfig(c.config); return m ? `Почта, ${m.user}` : "Почта"; }
  if (c.kind === "api") { const a = parseApiConfig(c.config); return a ? `API, ${a.url.replace(/^https?:\/\//, "")}` : "API"; }
  return c.kind;
}

/** «Проверить» on an API connector: its answer in the window's words. */
export function apiCheckMessage(status: number | null): { ok: boolean; message: string } {
  if (status === null) return { ok: false, message: "✕ Сервер не отвечает" };
  if (status === 401 || status === 403) return { ok: false, message: "✕ Неверный токен" };
  if (status >= 200 && status < 400) return { ok: true, message: "✓ Подключено" };
  return { ok: false, message: `✕ Сервер ответил ${status}` };
}
