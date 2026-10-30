// Connector ↔ YAML for the window's «YAML» tab (pure, unit-tested in connector-spec.test.ts).
// Passwords and tokens never appear here, and are not taken from a loaded file.
import { parse, stringify } from "yaml";
import { MAIL_PORTS, type ConnectorKind, type MailSending } from "./connectors";
import { MAIL_TOOLS, parseToolsOff } from "./mail-catalog";

/** The window's fields, as typed (ports too): what the YAML fills and is made from. A new connector has no type yet (""). */
export type ConnectorFields = {
  kind: ConnectorKind | ""; name: string; description: string; enabled: boolean;
  protocol: "imap" | "pop3"; host: string; port: string; sending: MailSending; smtpHost: string; smtpPort: string; user: string;
  url: string;
  /** Mail tools switched off on the «Инструменты» tab (lib/mail-catalog.ts). */
  toolsOff: string[];
};

export const EMPTY_FIELDS: ConnectorFields = {
  kind: "", name: "", description: "", enabled: true,
  protocol: "imap", host: "", port: String(MAIL_PORTS.imap), sending: "none", smtpHost: "", smtpPort: String(MAIL_PORTS.smtp), user: "", url: "", toolsOff: [],
};

const num = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : s.trim());

export function fieldsToYaml(f: ConnectorFields): string {
  const head = { version: 1, type: f.kind, name: f.name, description: f.description, enabled: f.enabled };
  // the mail tools that are on: a file without «tools:» leaves the checkboxes as they are
  const tools = MAIL_TOOLS.filter((t) => !f.toolsOff.includes(t.key)).map((t) => t.key);
  const doc = f.kind === "mail"
    ? { ...head, incoming: { protocol: f.protocol, host: f.host, port: num(f.port) }, outgoing: f.sending === "smtp" ? { host: f.smtpHost, port: num(f.smtpPort) } : "none", user: f.user, tools }
    : f.kind === "api" ? { ...head, url: f.url } : head;
  return "# AI Portal — коннектор. Пароли и токены сюда не попадают.\n" + stringify(doc, { lineWidth: 0 });
}

const SECRET_KEYS = ["password", "pass", "token", "secret"];

/**
 * YAML text → the window's fields, starting from `current` (what is not in the file stays).
 * A saved connector keeps its type; a password or token in the file is ignored with a warning.
 */
export function yamlToFields(text: string, current: ConnectorFields, typeLocked: boolean): { fields: ConnectorFields; warnings: string[] } | { error: string } {
  let doc: unknown;
  try { doc = parse(text); } catch (e) { return { error: `Не получилось прочитать YAML: ${(e as Error).message.split("\n")[0]}` }; }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { error: "В YAML нет описания коннектора" };
  const o = doc as Record<string, unknown>;
  const warnings: string[] = [];
  const str = (v: unknown, dflt: string) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : dflt);
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

  let kind = current.kind;
  if (o.type !== undefined && o.type !== current.kind) {
    if (typeLocked) warnings.push("Тип сохранённого коннектора не меняется — остаётся прежний");
    else if (o.type === "mail" || o.type === "api") kind = o.type;
    else warnings.push(`Тип «${String(o.type)}» не известен — остаётся прежний`);
  }
  const inc = obj(o.incoming), out = obj(o.outgoing);
  const all = [o, inc, out];
  if (all.some((x) => SECRET_KEYS.some((k) => k in x))) warnings.push("Пароль и токен из файла не берутся — впишите их на вкладке «Подключение»");

  return {
    fields: {
      kind,
      name: str(o.name, current.name).slice(0, 80),
      description: str(o.description, current.description).slice(0, 300),
      enabled: typeof o.enabled === "boolean" ? o.enabled : current.enabled,
      protocol: inc.protocol === "pop3" ? "pop3" : inc.protocol === "imap" ? "imap" : current.protocol,
      host: str(inc.host, current.host), port: str(inc.port, current.port),
      // «outgoing: none» — no sending; an object — SMTP; nothing — as it was
      sending: o.outgoing === "none" ? "none" : o.outgoing && typeof o.outgoing === "object" ? "smtp" : current.sending,
      smtpHost: str(out.host, current.smtpHost), smtpPort: str(out.port, current.smtpPort),
      user: str(o.user, current.user),
      url: str(o.url, current.url),
      toolsOff: Array.isArray(o.tools) ? MAIL_TOOLS.map((t) => t.key).filter((k) => !(o.tools as unknown[]).includes(k)) : parseToolsOff(current.toolsOff),
    },
    warnings,
  };
}
