import { test } from "node:test";
import assert from "node:assert/strict";
import { agentInstructions, chatInstructions, CHAT_INSTRUCTIONS } from "./instructions";

const NOTHING = { mail: false, agents: false, connectors: false };

test("the chat instruction: no date, no name, no policy contents; the date comes with the policies", () => {
  assert.ok(CHAT_INSTRUCTIONS.startsWith("Ты — Ассистент портала AI Portal"));
  assert.ok(CHAT_INSTRUCTIONS.includes("get_policies") && CHAT_INSTRUCTIONS.includes("now из get_policies") && CHAT_INSTRUCTIONS.includes("Ограничения:"));
  assert.ok(!CHAT_INSTRUCTIONS.includes("current_time"));
  assert.ok(!/\d{4}/.test(CHAT_INSTRUCTIONS), "no year/date inside");
  assert.ok(!CHAT_INSTRUCTIONS.includes("Траты") && !CHAT_INSTRUCTIONS.includes("тратах"));
});

test("without connections it says nothing about mail or agents, and answers «что умеешь» in one sentence", () => {
  const t = chatInstructions(NOTHING);
  assert.ok(!/почт|письм/i.test(t.replace("«Агенты → Ассистент»", "")), t);
  assert.ok(!t.includes("run_agent"));
  assert.ok(t.includes("«Сейчас только разговаривать: подключений и агентов у меня нет"));
});

test("mail and agent rules only when they are given", () => {
  const t = chatInstructions({ mail: true, agents: true, connectors: true });
  assert.ok(t.includes("Письма меняй и отправляй") && t.includes("run_agent"));
  assert.ok(!t.includes("Сейчас только разговаривать"));
  assert.ok(!chatInstructions({ mail: false, agents: true, connectors: false }).includes("Письма меняй"));
});

test("agent instruction = its own text + the shared rules", () => {
  const t = agentInstructions("Составь сводку новых писем.", NOTHING);
  assert.ok(t.startsWith("Составь сводку новых писем.") && t.includes("get_policies") && t.includes("now из get_policies"));
  assert.ok(!t.includes("Сейчас только разговаривать"), "the one-sentence answer is the assistant's");
  assert.ok(agentInstructions("  ").startsWith("Ты — агент портала AI Portal."));
});
