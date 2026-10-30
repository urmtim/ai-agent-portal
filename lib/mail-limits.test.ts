import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIMITS, limitsFromFields, limitsText, limitsToFields, limitsToStore, parseLimits } from "./mail-limits";

test("defaults are what the tools had before the tab", () => {
  assert.deepEqual(DEFAULT_LIMITS, { searchLimit: 20, searchDays: 90, actionLimit: 50, letterChars: 6000, attachMb: 10, attachChars: 20000, pop3Scan: 200 });
  assert.deepEqual(parseLimits("{}"), DEFAULT_LIMITS);
  assert.deepEqual(parseLimits("broken"), DEFAULT_LIMITS);
  assert.deepEqual(parseLimits(null), DEFAULT_LIMITS);
});

test("stored values: kept, clamped, «без ограничения» only for the period", () => {
  const m = parseLimits('{"searchLimit":100,"actionLimit":99999,"searchDays":null,"letterChars":"x","pop3Scan":null}');
  assert.equal(m.searchLimit, 100);
  assert.equal(m.actionLimit, 1000);
  assert.equal(m.searchDays, null);
  assert.equal(m.letterChars, 6000);
  assert.equal(m.pop3Scan, 200);
  assert.equal(parseLimits({ searchDays: "none" }).searchDays, null);
});

test("window fields: round trip, empty period is unlimited, first problem only", () => {
  const f = limitsToFields({ ...DEFAULT_LIMITS, searchDays: null });
  assert.equal(f.searchDays, "");
  assert.deepEqual(limitsFromFields(f), { ...DEFAULT_LIMITS, searchDays: null });
  assert.deepEqual(limitsFromFields({ ...f, searchLimit: "0", actionLimit: "abc" }), { key: "searchLimit", error: "Число от 1 до 200" });
  assert.deepEqual(limitsFromFields({ ...f, actionLimit: "" }), { key: "actionLimit", error: "Число от 1 до 1000" });
  assert.deepEqual(limitsFromFields({ ...f, letterChars: "1.5" }), { key: "letterChars", error: "Число от 500 до 200000" });
});

test("only changed limits are stored", () => {
  assert.equal(limitsToStore(DEFAULT_LIMITS), "{}");
  assert.equal(limitsToStore({ ...DEFAULT_LIMITS, searchLimit: 100, searchDays: null }), '{"searchLimit":100,"searchDays":null}');
  assert.deepEqual(parseLimits(limitsToStore({ ...DEFAULT_LIMITS, searchLimit: 100, searchDays: null })), { ...DEFAULT_LIMITS, searchLimit: 100, searchDays: null });
});

test("the model hears the limits in words, with where they are changed", () => {
  const t = limitsText(DEFAULT_LIMITS, "imap");
  assert.match(t, /^поиск — до 20 писем за раз, следующие — продолжением поиска; период поиска — до 90 дн\.; действие — до 50 писем за раз;/);
  assert.match(t, /вкладке «Лимиты»$/);
  assert.match(limitsText({ ...DEFAULT_LIMITS, searchDays: null }, "pop3"), /период поиска не ограничен; по POP3 видны только 200 последних писем/);
});
