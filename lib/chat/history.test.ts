import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, fallbackTitle, groupChats, type ChatListItem } from "./history";

// 2026-10-28 15:00 in Moscow (UTC+3)
const now = new Date("2026-10-28T12:00:00Z");
const chat = (id: string, iso: string, extra: Partial<ChatListItem> = {}): ChatListItem =>
  ({ id, title: id, pinned: false, archived: false, updatedAt: new Date(iso), ...extra });

test("groups by Moscow day: today, yesterday, a date, earlier", () => {
  const groups = groupChats([
    chat("today", "2026-10-28T08:00:00Z"),
    chat("late-yesterday-utc-but-today-msk", "2026-10-27T22:30:00Z"),
    chat("yesterday", "2026-10-27T10:00:00Z"),
    chat("oct26", "2026-10-26T10:00:00Z"),
    chat("old", "2026-10-10T10:00:00Z"),
  ], now);
  assert.deepEqual(groups.map((g) => g.label), ["Сегодня", "Вчера", "26 окт", "Ранее"]);
  assert.deepEqual(groups[0].chats.map((c) => c.id), ["today", "late-yesterday-utc-but-today-msk"]);
});

test("pinned on top, archived in a collapsed group at the bottom, empty groups dropped", () => {
  const groups = groupChats([
    chat("a", "2026-10-28T08:00:00Z", { archived: true, pinned: true }),
    chat("p", "2026-10-01T08:00:00Z", { pinned: true }),
    chat("t", "2026-10-28T09:00:00Z"),
  ], now);
  assert.deepEqual(groups.map((g) => [g.key, g.chats.map((c) => c.id)]), [["pinned", ["p"]], ["2026-10-28", ["t"]], ["archive", ["a"]]]);
  assert.equal(groups.at(-1)!.collapsed, true);
});

test("newest first inside a group", () => {
  const [g] = groupChats([chat("older", "2026-10-28T07:00:00Z"), chat("newer", "2026-10-28T09:00:00Z")], now);
  assert.deepEqual(g.chats.map((c) => c.id), ["newer", "older"]);
});

test("fallbackTitle: short text as is, long text cut on a word with an ellipsis", () => {
  assert.equal(fallbackTitle("  Собери   чеки\nза октябрь "), "Собери чеки за октябрь");
  assert.equal(fallbackTitle(""), "Новый чат");
  const long = fallbackTitle("Помоги составить план покупок на неделю для семьи из четырёх человек с учётом бюджета");
  assert.ok(long.length <= 60, long);
  assert.ok(long.endsWith("…"));
  assert.ok(!long.includes("бюджета"));
});

test("cleanTitle strips quotes, prefixes and trailing dots; rejects unusable output", () => {
  assert.equal(cleanTitle("«Чеки за октябрь»."), "Чеки за октябрь");
  assert.equal(cleanTitle('Название: "План покупок"\n\nОбъяснение…'), "План покупок");
  assert.equal(cleanTitle("   "), null);
  assert.equal(cleanTitle("x".repeat(80)), null);
});
