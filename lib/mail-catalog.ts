// What a «Почта» connector can give agents (pure, unit-tested in mail-catalog.test.ts).
// Tools are grouped by consequence, like Gmail and Outlook scopes: reading changes nothing, a change can be undone
// inside the mailbox, a send goes out and can't be. Everything is on unless switched off on the connector's «Инструменты» tab.
import type { HitlChoice } from "./agents/policy";

export type MailGroup = "read" | "change" | "send";

export const MAIL_GROUPS: { key: MailGroup; label: string; desc: string }[] = [
  { key: "read", label: "Чтение", desc: "Ничего не меняет" },
  { key: "change", label: "Изменение", desc: "Меняет ящик, всё можно вернуть" },
  { key: "send", label: "Отправка", desc: "Уходит наружу, не вернуть" },
];

/** What a tool needs from the connection: folders and changes exist only over IMAP, sending only with SMTP. */
export type MailNeed = "imap" | "smtp";

export type MailToolInfo = { key: string; tool: string; label: string; desc: string; group: MailGroup; need?: MailNeed };

export const MAIL_TOOLS: MailToolInfo[] = [
  { key: "search", tool: "mail_search", label: "Искать письма", desc: "По теме, отправителю, тексту и периоду", group: "read" },
  { key: "read", tool: "mail_read", label: "Читать письма", desc: "Текст письма и список вложений", group: "read" },
  { key: "attach", tool: "mail_attachment", label: "Вложения", desc: "Текст из PDF, Word и текстовых файлов", group: "read" },
  { key: "count", tool: "mail_count", label: "Считать письма", desc: "Сколько всего и непрочитанных", group: "read" },
  { key: "folders", tool: "mail_folders", label: "Смотреть папки", desc: "Корзина, Отправленные, Спам и другие", group: "read", need: "imap" },
  { key: "move", tool: "mail_move", label: "Перемещать письма", desc: "Между папками, в архив, обратно из корзины", group: "change", need: "imap" },
  { key: "flags", tool: "mail_mark", label: "Отмечать письма", desc: "Прочитано, не прочитано, флажок", group: "change", need: "imap" },
  { key: "spam", tool: "mail_spam", label: "Спам", desc: "Пометить спамом или вернуть во входящие", group: "change", need: "imap" },
  { key: "drafts", tool: "mail_draft", label: "Черновики", desc: "Подготовить письмо, отправите сами", group: "change", need: "imap" },
  { key: "folder_new", tool: "mail_folder", label: "Создавать папки", desc: "Создать или переименовать папку", group: "change", need: "imap" },
  { key: "trash", tool: "mail_trash", label: "Удалять в корзину", desc: "Насовсем не удаляет", group: "change", need: "imap" },
  { key: "send", tool: "mail_send", label: "Отправлять письма", desc: "Новое письмо", group: "send", need: "smtp" },
  { key: "reply", tool: "mail_reply", label: "Отвечать", desc: "Ответ и ответ всем", group: "send", need: "smtp" },
  { key: "forward", tool: "mail_forward", label: "Пересылать", desc: "Вместе с вложениями", group: "send", need: "smtp" },
];

export const MAIL_TOOL_NAMES = MAIL_TOOLS.map((t) => t.tool);

export const NEED_TEXT: Record<MailNeed, string> = { imap: "Нужно получение по IMAP", smtp: "Нужна отправка по SMTP" };

/** What the connection allows. */
export type MailAbility = { protocol: "imap" | "pop3"; smtp: boolean };

export const mailToolUsable = (t: MailToolInfo, a: MailAbility) => !t.need || (t.need === "imap" ? a.protocol === "imap" : a.smtp);

/** Stored or YAML list of switched-off keys → known keys only. */
export function parseToolsOff(raw: unknown): string[] {
  let v = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw || "[]"); } catch { return []; } }
  return Array.isArray(v) ? [...new Set(v.filter((k): k is string => typeof k === "string" && MAIL_TOOLS.some((t) => t.key === k)))] : [];
}

/** Keys that are switched on and usable with this connection. */
export const mailToolsOn = (a: MailAbility, off: string[]) => MAIL_TOOLS.filter((t) => mailToolUsable(t, a) && !off.includes(t.key));

/** The model's tool names for a connector. */
export const availableMailTools = (a: MailAbility, off: string[]) => mailToolsOn(a, off).map((t) => t.tool);

export const mailToolGroup = (tool: string): MailGroup | undefined => MAIL_TOOLS.find((t) => t.tool === tool)?.group;

/** Does this HITL ask before the tool runs? Changes — when asking before changes and sends; sends — unless HITL is off. */
export function mailNeedsApproval(tool: string, hitl: HitlChoice): boolean {
  const g = mailToolGroup(tool);
  if (g === "send") return hitl !== "off";
  if (g === "change") return hitl === "changes_and_send";
  return false;
}

/** What a connector gives, in words, by its switched-on groups: «искать и читать письма, менять ящик, отправлять письма». */
export function mailGives(a: MailAbility, off: string[]): string {
  const on = mailToolsOn(a, off);
  if (!on.length) return "ничего: все инструменты выключены";
  return MAIL_GROUPS.flatMap((g) => {
    const list = on.filter((t) => t.group === g.key).map((t) => t.label.toLowerCase());
    return list.length ? [`${g.label.toLowerCase()}: ${list.join(", ")}`] : [];
  }).join("; ");
}

// ---- folders ----

/** Special folders by their IMAP special-use flag; the model and the user call them by these names. */
export const SPECIAL_FOLDERS = {
  "\\Inbox": "Входящие", "\\Sent": "Отправленные", "\\Drafts": "Черновики", "\\Trash": "Корзина", "\\Junk": "Спам", "\\Archive": "Архив",
} as const;
export type SpecialUse = keyof typeof SPECIAL_FOLDERS;

/** Usual names of special folders on servers that don't flag them. */
const SPECIAL_NAMES: Record<SpecialUse, string[]> = {
  "\\Inbox": ["inbox", "входящие"],
  "\\Sent": ["sent", "sent items", "sent messages", "отправленные"],
  "\\Drafts": ["drafts", "черновики"],
  "\\Trash": ["trash", "deleted", "deleted items", "deleted messages", "bin", "корзина", "удаленные", "удалённые"],
  "\\Junk": ["junk", "spam", "bulk mail", "спам"],
  "\\Archive": ["archive", "архив"],
};

export type FolderInfo = { path: string; name: string; specialUse?: string };

const last = (path: string, delim = "/") => path.split(delim).pop() ?? path;

/** The special use of a folder: its flag, else its usual name. */
export function specialOf(f: FolderInfo): SpecialUse | undefined {
  if (f.specialUse && f.specialUse in SPECIAL_FOLDERS) return f.specialUse as SpecialUse;
  if (f.path.toUpperCase() === "INBOX") return "\\Inbox";
  const n = last(f.path).toLowerCase(), m = f.name.toLowerCase();
  return (Object.keys(SPECIAL_NAMES) as SpecialUse[]).find((k) => SPECIAL_NAMES[k].includes(n) || SPECIAL_NAMES[k].includes(m));
}

/** A folder's name for people and the model: Russian for special ones, its own name otherwise. */
export const folderLabel = (f: FolderInfo) => { const s = specialOf(f); return s ? SPECIAL_FOLDERS[s] : f.name; };

/** The folder a user or the model named: by path, by name or by the Russian name of a special one, ignoring case. */
export function resolveFolder(list: FolderInfo[], asked: string | undefined): FolderInfo | null {
  const q = (asked ?? "").trim().replace(/^[«"']|[»"']$/g, "").toLowerCase();
  if (!q) return list.find((f) => specialOf(f) === "\\Inbox") ?? null;
  return list.find((f) => f.path.toLowerCase() === q)
    ?? list.find((f) => folderLabel(f).toLowerCase() === q)
    ?? list.find((f) => f.name.toLowerCase() === q)
    ?? list.find((f) => { const s = specialOf(f); return !!s && SPECIAL_NAMES[s].includes(q); })
    ?? null;
}

/** The special folder of this kind, if the mailbox has one. */
export const findSpecial = (list: FolderInfo[], use: SpecialUse) => list.find((f) => specialOf(f) === use) ?? null;

/** 1 письмо, 2 письма, 5 писем. */
export function letters(n: number): string {
  const d = n % 10, h = n % 100;
  return `${n} ${d === 1 && h !== 11 ? "письмо" : d >= 2 && d <= 4 && (h < 12 || h > 14) ? "письма" : "писем"}`;
}

/** The approval card of a mail change or send: what will be done, before it is. */
export function mailActionText(tool: string, input: Record<string, unknown> | undefined): { title: string; lines: string[] } {
  const i = input ?? {};
  const str = (k: string) => (typeof i[k] === "string" ? (i[k] as string).trim() : "");
  const n = Array.isArray(i.ids) ? i.ids.length : 0;
  const from = `«${str("folder") || "Входящие"}»`;
  const text = (k = "text") => { const t = str(k).replace(/\s+/g, " "); return t ? [`Текст: ${t.length > 200 ? t.slice(0, 200) + "…" : t}`] : []; };
  const to = (k = "to") => (str(k) ? [`Кому: ${str(k)}`] : []);
  switch (tool) {
    case "mail_move": return { title: "Переместить письма", lines: [`${letters(n)} из ${from} в «${str("to")}»`] };
    case "mail_mark": {
      const what = [i.read === true && "прочитано", i.read === false && "не прочитано", i.flagged === true && "поставить флажок", i.flagged === false && "снять флажок"].filter(Boolean).join(", ");
      return { title: "Отметить письма", lines: [`${letters(n)} в ${from}: ${what}`] };
    }
    case "mail_spam": return i.spam === false
      ? { title: "Вернуть из спама", lines: [`${letters(n)} из ${from} во «Входящие»`] }
      : { title: "Пометить спамом", lines: [`${letters(n)} из ${from} в «Спам»`] };
    case "mail_draft": return { title: "Положить в черновики", lines: [...to(), ...(str("subject") ? [`Тема: ${str("subject")}`] : []), ...(i.replyTo ? ["Ответ на письмо"] : []), ...text()] };
    case "mail_folder": return str("rename")
      ? { title: "Переименовать папку", lines: [`«${str("rename")}» → «${str("name")}»`] }
      : { title: "Создать папку", lines: [`«${str("name")}»`] };
    case "mail_trash": return { title: "Удалить в корзину", lines: [`${letters(n)} из ${from}`] };
    case "mail_send": return { title: "Отправить письмо", lines: [...to(), ...(str("cc") ? [`Копия: ${str("cc")}`] : []), `Тема: ${str("subject") || "без темы"}`, ...text()] };
    case "mail_reply": return { title: i.all ? "Ответить всем" : "Ответить на письмо", lines: [`Письмо из ${from}`, ...text()] };
    case "mail_forward": return { title: "Переслать письмо", lines: [...to(), `Письмо из ${from}, с вложениями`, ...text()] };
    default: return { title: "Действие с почтой", lines: [] };
  }
}
