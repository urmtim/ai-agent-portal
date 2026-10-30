import { test } from "node:test";
import assert from "node:assert/strict";
import { policySnapshot, timeNow, withPolicies } from "./policy-tools";

test("policy snapshot: HITL modes and guardrails", () => {
  const s = policySnapshot("changes_and_send", [{ kind: "maskPii" }, { kind: "maxSteps", value: 3 }, { kind: "forbiddenTopic", value: "политика" }], [{ name: "Регламент", text: "Не называй суммы." }]);
  assert.equal(s.hitl.mode, "Спрашивать перед изменением и отправкой");
  assert.equal(s.hitl.confirmBefore.length, 2);
  assert.deepEqual(s.guardrails.forbiddenTopics, ["политика"]);
  assert.equal(s.guardrails.maxToolStepsPerAnswer, 3);
  assert.equal(s.guardrails.maskedPersonalData.length, 4);
  assert.deepEqual(s.guardrails.documents, [{ name: "Регламент", rules: "Не называй суммы." }]);
  assert.deepEqual(policySnapshot("off", [], []).hitl.confirmBefore, []);
  assert.equal(policySnapshot("send_only", [], []).hitl.confirmBefore.length, 1);
  assert.deepEqual(policySnapshot("off", [], []).guardrails.maskedPersonalData, []);
});

test("time in Moscow", () => {
  const t = timeNow(new Date("2026-10-30T11:20:00Z"));
  assert.ok(t.date.startsWith("30 октября 2026"));
  assert.equal(t.time, "14:20");
  assert.equal(t.weekday, "пятница");
});

test("policies go right before the current question", () => {
  const s = policySnapshot("off", [], []);
  const out = withPolicies([
    { role: "user", content: "привет" }, { role: "assistant", content: "здравствуйте" }, { role: "user", content: "что нового?" },
  ], s);
  assert.deepEqual(out.map((m) => m.role), ["user", "assistant", "assistant", "tool", "user"]);
  assert.equal(withPolicies([], s).length, 2);
});

test("the snapshot says the model and connectors only when given", () => {
  assert.equal("access" in policySnapshot("off", [], []), false);
  const access = { model: "Облако (gpt-oss:120b)", connectors: [{ name: "Моя почта", type: "Почта", server: "IMAP imap.mail.ru", gives: "искать и читать письма" }] };
  assert.deepEqual(policySnapshot("off", [], [], access).access, access);
});
