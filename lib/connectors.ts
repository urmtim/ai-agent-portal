// MCP connector catalog and the pure parts of connection settings (unit-tested in connectors.test.ts).
// A connector is a kind of outside service; a connection is one user's configured instance of it.

export const CONNECTORS = {
  mail: {
    label: "Почта",
    desc: "Почтовый ящик по IMAP: искать и читать письма",
    tools: ["Искать письма", "Прочитать письмо"],
  },
} as const;

export type ConnectorKind = keyof typeof CONNECTORS;

export function isConnectorKind(k: string): k is ConnectorKind {
  return Object.prototype.hasOwnProperty.call(CONNECTORS, k);
}

/** Mail services with known IMAP settings; «other» means the user types the server. */
export const MAIL_PRESETS = {
  mailru: { label: "Mail.ru", host: "imap.mail.ru", port: 993 },
  yandex: { label: "Яндекс", host: "imap.yandex.ru", port: 993 },
  gmail: { label: "Gmail", host: "imap.gmail.com", port: 993 },
  other: { label: "Другой", host: "", port: 993 },
} as const;

export type MailPreset = keyof typeof MAIL_PRESETS;

export type MailConfig = { host: string; port: number; secure: boolean; user: string };

/** Which preset a saved server belongs to (for the edit form). */
export function presetFor(host: string): MailPreset {
  const found = (Object.keys(MAIL_PRESETS) as MailPreset[]).find((k) => k !== "other" && MAIL_PRESETS[k].host === host.trim().toLowerCase());
  return found ?? "other";
}

/** Stored JSON → mail settings, or null when unusable. */
export function parseMailConfig(raw: string | null | undefined): MailConfig | null {
  let v: unknown;
  try { v = JSON.parse(raw || "{}"); } catch { return null; }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const host = typeof o.host === "string" ? o.host.trim() : "";
  const user = typeof o.user === "string" ? o.user.trim() : "";
  const port = Number(o.port);
  if (!host || !user || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, user, port, secure: o.secure !== false };
}

/** Form fields → mail settings: a preset fills the server, «other» takes it from the form. Returns an error text when invalid. */
export function mailConfigFromForm(f: { preset: string; host: string; port: string; secure: boolean; user: string }): MailConfig | string {
  const preset = (Object.prototype.hasOwnProperty.call(MAIL_PRESETS, f.preset) ? f.preset : "other") as MailPreset;
  const host = (preset === "other" ? f.host : MAIL_PRESETS[preset].host).trim().toLowerCase();
  const port = preset === "other" ? Number(f.port) : MAIL_PRESETS[preset].port;
  const user = f.user.trim();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$|^localhost$|^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return "Укажите адрес почтового сервера, например imap.mail.ru";
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "Порт — число от 1 до 65535";
  if (!user) return "Укажите логин — обычно это адрес почты";
  return { host, port, user, secure: preset === "other" ? f.secure : true };
}
