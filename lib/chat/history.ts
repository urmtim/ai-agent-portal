// Pure helpers for the chat sidebar and chat titles (no DB, no React) — unit-tested.

export type ChatListItem = { id: string; title: string; pinned: boolean; archived: boolean; updatedAt: Date };

export type ChatGroup = { key: string; label: string; chats: ChatListItem[]; collapsed?: boolean };

/** Dates are grouped in the family's time zone, so server and browser agree. */
export const CHAT_TIME_ZONE = "Europe/Moscow";

const DAY_MS = 86_400_000;

function dayKey(d: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

/**
 * Sidebar groups: Закреплённые, Сегодня, Вчера, one per date for the last week, Ранее,
 * and a collapsed Архив. Newest first inside each group; empty groups are dropped.
 */
export function groupChats(chats: ChatListItem[], now: Date, timeZone = CHAT_TIME_ZONE): ChatGroup[] {
  const today = dayKey(now, timeZone);
  const sorted = [...chats].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const pinned: ChatListItem[] = [], archived: ChatListItem[] = [], earlier: ChatListItem[] = [];
  const byDay = new Map<string, ChatListItem[]>();

  for (const c of sorted) {
    if (c.archived) { archived.push(c); continue; }
    if (c.pinned) { pinned.push(c); continue; }
    const key = dayKey(c.updatedAt, timeZone);
    if (daysBetween(key, today) > 6) { earlier.push(c); continue; }
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(c);
  }

  const dateLabel = new Intl.DateTimeFormat("ru-RU", { timeZone, day: "numeric", month: "short" });
  const groups: ChatGroup[] = [{ key: "pinned", label: "Закреплённые", chats: pinned }];
  for (const [key, items] of byDay) {
    const ago = daysBetween(key, today);
    const label = ago <= 0 ? "Сегодня" : ago === 1 ? "Вчера" : dateLabel.format(items[0].updatedAt).replace(/\.$/, "");
    groups.push({ key, label, chats: items });
  }
  groups.push({ key: "earlier", label: "Ранее", chats: earlier });
  groups.push({ key: "archive", label: "Архив", chats: archived, collapsed: true });
  return groups.filter((g) => g.chats.length > 0);
}

export const TITLE_MAX = 60;

/** Title from the start of the first user message, cut on a word boundary. */
export function fallbackTitle(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "Новый чат";
  if (flat.length <= TITLE_MAX) return flat;
  const cut = flat.slice(0, TITLE_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return (space > TITLE_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, "") + "…";
}

/** A model-made title, or null when it is unusable (empty, multi-paragraph, too long). */
export function cleanTitle(raw: string): string | null {
  const line = raw.trim().split(/\r?\n/).find((l) => l.trim()) ?? "";
  const t = line
    .replace(/^(название|title)\s*:\s*/i, "")
    .replace(/^[\s"'«»“”`*#]+|[\s"'«»“”`*.。]+$/g, "")
    .trim();
  return t && t.length <= TITLE_MAX ? t : null;
}
