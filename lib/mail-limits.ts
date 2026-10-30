// A «Почта» connector's limits — the «Лимиты» tab (pure, unit-tested in mail-limits.test.ts).
// Every number the mail tools stop at lives here, with the defaults the portal had before the tab existed.

export type MailLimitKey = "searchLimit" | "searchDays" | "actionLimit" | "letterChars" | "attachMb" | "attachChars" | "pop3Scan";

export type MailLimitInfo = {
  key: MailLimitKey; label: string; def: number; min: number; max: number;
  /** Empty means «без ограничения» (only the search period). */
  optional?: boolean;
  /** Only for POP3. */
  pop3?: boolean;
};

export const MAIL_LIMITS: MailLimitInfo[] = [
  { key: "searchLimit", label: "Писем за один поиск", def: 20, min: 1, max: 200 },
  { key: "searchDays", label: "Период поиска, дней", def: 90, min: 1, max: 36500, optional: true },
  { key: "actionLimit", label: "Писем за одно действие", def: 50, min: 1, max: 1000 },
  { key: "letterChars", label: "Длина письма для модели, знаков", def: 6000, min: 500, max: 200000 },
  { key: "attachMb", label: "Размер вложения, МБ", def: 10, min: 1, max: 50 },
  { key: "attachChars", label: "Текст вложения, знаков", def: 20000, min: 1000, max: 200000 },
  { key: "pop3Scan", label: "POP3: сколько последних писем смотреть", def: 200, min: 10, max: 10000, pop3: true },
];

/** The limits in force; `searchDays: null` — search over all time. */
export type MailLimits = { [K in MailLimitKey]: K extends "searchDays" ? number | null : number };

export const DEFAULT_LIMITS: MailLimits = Object.fromEntries(MAIL_LIMITS.map((l) => [l.key, l.def])) as MailLimits;

const clamp = (l: MailLimitInfo, n: number) => Math.min(l.max, Math.max(l.min, Math.round(n)));

/** Stored or YAML limits → all of them; missing or broken values take the default, numbers out of range are clamped. */
export function parseLimits(raw: unknown): MailLimits {
  let v = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw || "{}"); } catch { v = {}; } }
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out = { ...DEFAULT_LIMITS } as Record<MailLimitKey, number | null>;
  for (const l of MAIL_LIMITS) {
    const x = o[l.key];
    if (l.optional && (x === null || x === "none")) out[l.key] = null;
    else if (typeof x === "number" && Number.isFinite(x)) out[l.key] = clamp(l, x);
  }
  return out as MailLimits;
}

/** The limits as the window's fields show them: numbers as text, «без ограничения» as "". */
export const limitsToFields = (m: MailLimits): Record<MailLimitKey, string> =>
  Object.fromEntries(MAIL_LIMITS.map((l) => [l.key, m[l.key] === null ? "" : String(m[l.key])])) as Record<MailLimitKey, string>;

/** Window fields → limits, or the first problem from top to bottom. */
export function limitsFromFields(f: Partial<Record<MailLimitKey, string>>): MailLimits | { key: MailLimitKey; error: string } {
  const out = { ...DEFAULT_LIMITS } as Record<MailLimitKey, number | null>;
  for (const l of MAIL_LIMITS) {
    const s = (f[l.key] ?? "").trim();
    if (!s && l.optional) { out[l.key] = null; continue; }
    const n = Number(s);
    if (!s || !Number.isInteger(n) || n < l.min || n > l.max) return { key: l.key, error: `Число от ${l.min} до ${l.max}` };
    out[l.key] = n;
  }
  return out as MailLimits;
}

/** Stored JSON: only what differs from the defaults, so a later default change reaches untouched connectors. */
export function limitsToStore(m: MailLimits): string {
  return JSON.stringify(Object.fromEntries(MAIL_LIMITS.filter((l) => m[l.key] !== l.def).map((l) => [l.key, m[l.key]])));
}

/** What the model is told about the limits, in words. */
export function limitsText(m: MailLimits, protocol: "imap" | "pop3"): string {
  return [
    `поиск — до ${m.searchLimit} писем за раз, следующие — продолжением поиска`,
    m.searchDays === null ? "период поиска не ограничен" : `период поиска — до ${m.searchDays} дн.`,
    ...(protocol === "imap" ? [`действие — до ${m.actionLimit} писем за раз`] : [`по POP3 видны только ${m.pop3Scan} последних писем`]),
    `письмо — до ${m.letterChars} знаков, вложение — до ${m.attachMb} МБ и ${m.attachChars} знаков`,
    "лимиты меняются в коннекторе на вкладке «Лимиты»",
  ].join("; ");
}
