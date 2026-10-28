// Catalog of portal sections and the pure logic behind the pinned top menu.
// No React here, so it can be unit-tested (see nav.test.ts).

export type NavKey =
  | "chat" | "agents" | "mcp" | "models"
  | "learn" | "stats" | "me"
  | "users" | "access";

export type NavItem = {
  key: NavKey;
  label: string;
  href: string;
  /** Path prefixes that belong to this section (besides href itself). */
  match?: string[];
  adminOnly?: boolean;
};

export type NavGroup = {
  title: string;
  note?: string;
  /** Items of this group are shown dimmed in the tray. */
  dim?: boolean;
  adminOnly?: boolean;
  items: NavKey[];
};

export const NAV: Record<NavKey, NavItem> = {
  chat: { key: "chat", label: "Чат", href: "/chat" },
  agents: { key: "agents", label: "Агенты", href: "/agents" },
  mcp: { key: "mcp", label: "MCP", href: "/mcp" },
  models: { key: "models", label: "Модели", href: "/models" },
  learn: { key: "learn", label: "Обучение", href: "/", match: ["/courses"] },
  stats: { key: "stats", label: "Траты", href: "/stats" },
  me: { key: "me", label: "Прогресс", href: "/me" },
  users: { key: "users", label: "Пользователи", href: "/admin/users", adminOnly: true },
  access: { key: "access", label: "Доступы", href: "/admin/access", adminOnly: true },
};

export const NAV_GROUPS: NavGroup[] = [
  { title: "Основное", items: ["chat"] },
  { title: "AI", items: ["agents", "mcp", "models"] },
  { title: "Семья", note: "(скрыто)", dim: true, items: ["learn", "stats", "me"] },
  { title: "Админ", adminOnly: true, items: ["users", "access"] },
];

export const DEFAULT_PINS: NavKey[] = ["chat", "agents", "mcp", "models"];

export const PINS_STORAGE_KEY = "portal.nav.pins.v1";

function isNavKey(k: unknown): k is NavKey {
  return typeof k === "string" && Object.prototype.hasOwnProperty.call(NAV, k);
}

/** Saved pins from storage; unknown keys and duplicates dropped, default when nothing usable is left. */
export function parsePins(raw: string | null | undefined): NavKey[] {
  if (!raw) return DEFAULT_PINS.slice();
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return DEFAULT_PINS.slice(); }
  if (!Array.isArray(data)) return DEFAULT_PINS.slice();
  const pins = [...new Set(data.filter(isNavKey))];
  return pins.length ? pins : DEFAULT_PINS.slice();
}

/** Pins the current user may see (admin items hidden from non-admins, but kept in storage). */
export function visiblePins(pins: NavKey[], isAdmin: boolean): NavKey[] {
  return pins.filter((k) => isAdmin || !NAV[k].adminOnly);
}

/** Section to highlight for a path: the longest matching href or prefix wins. */
export function navKeyForPath(pathname: string): NavKey | undefined {
  let best: { key: NavKey; len: number } | undefined;
  for (const item of Object.values(NAV)) {
    const prefixes = [item.href, ...(item.match ?? [])];
    for (const p of prefixes) {
      const hit = p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/");
      if (hit && (!best || p.length > best.len)) best = { key: item.key, len: p.length };
    }
  }
  return best?.key;
}

/** Puts key at index among the other pins (pins it if it was not pinned). */
export function movePin(pins: NavKey[], key: NavKey, index: number): NavKey[] {
  const rest = pins.filter((k) => k !== key);
  const i = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, i), key, ...rest.slice(i)];
}

/** Unpins key; the last pinned item stays. */
export function unpin(pins: NavKey[], key: NavKey): NavKey[] {
  const rest = pins.filter((k) => k !== key);
  return rest.length ? rest : pins;
}
