import { test } from "node:test";
import assert from "node:assert/strict";
import { chatInstructions } from "./instructions";

test("built-in chat instruction reflects mail and agents", () => {
  const at = new Date("2026-10-29T10:00:00Z");
  const none = chatInstructions("Тимур", [], null, at);
  assert.ok(none.startsWith("Ты — ассистент портала AI Portal."));
  assert.ok(none.includes("Сегодня 29 октября 2026") && none.includes("Пользователь: Тимур."), none);
  assert.ok(none.includes("Доступа к почте пользователя у тебя нет.") && none.includes("Запускать агентов тебе не разрешено."));
  const full = chatInstructions("Тимур", [{ name: "Сводка почты" }], "Моя почта", at);
  assert.ok(full.includes("(ящик «Моя почта»)") && full.includes("run_agent") && full.includes("«Сводка почты»"));
});
