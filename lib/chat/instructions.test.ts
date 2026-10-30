import { test } from "node:test";
import assert from "node:assert/strict";
import { agentInstructions, CHAT_INSTRUCTIONS } from "./instructions";

test("the chat instruction is constant: no date, no name, no policy contents", () => {
  assert.ok(CHAT_INSTRUCTIONS.startsWith("Ты — Ассистент портала AI Portal"));
  assert.ok(CHAT_INSTRUCTIONS.includes("current_time") && CHAT_INSTRUCTIONS.includes("get_policies") && CHAT_INSTRUCTIONS.includes("Ограничения:"));
  assert.ok(!/\d{4}/.test(CHAT_INSTRUCTIONS), "no year/date inside");
  assert.ok(!CHAT_INSTRUCTIONS.includes("Траты") && !CHAT_INSTRUCTIONS.includes("тратах"));
});

test("agent instruction = its own text + the shared rules", () => {
  const t = agentInstructions("Составь сводку новых писем.");
  assert.ok(t.startsWith("Составь сводку новых писем.") && t.includes("get_policies") && t.includes("current_time"));
  assert.ok(agentInstructions("  ").startsWith("Ты — агент портала AI Portal."));
});
