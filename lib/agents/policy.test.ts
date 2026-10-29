import { test } from "node:test";
import assert from "node:assert/strict";
import { agentGuardrails, effectiveGuardrails, parseGuardPolicy, parseHitl, parseMcpAccess, parseRules, ruleLabel, rulesToYaml } from "./policy";

test("parseHitl reads old and new values", () => {
  assert.deepEqual(parseHitl("none"), { enabled: false, ask: "changes_and_send" });
  assert.deepEqual(parseHitl("confirm"), { enabled: true, ask: "changes_and_send" });
  assert.deepEqual(parseHitl('{"enabled":false,"ask":"send_only"}'), { enabled: false, ask: "send_only" });
  assert.deepEqual(parseHitl("garbage"), { enabled: true, ask: "changes_and_send" });
});

test("old guardrails become rules", () => {
  assert.deepEqual(parseGuardPolicy('{"maskPii":true,"maxSteps":3,"forbiddenTopics":["политика","медицина"]}'), {
    enabled: true,
    rules: [{ kind: "maskPii" }, { kind: "maxSteps", value: 3 }, { kind: "forbiddenTopic", value: "политика" }, { kind: "forbiddenTopic", value: "медицина" }],
  });
  assert.deepEqual(parseGuardPolicy("{}"), { enabled: true, rules: [{ kind: "maskPii" }, { kind: "maxSteps", value: 5 }] });
});

test("new guardrails: duplicates dropped, limit clamped", () => {
  const p = parseGuardPolicy({ enabled: false, rules: [{ kind: "maxSteps", value: 50 }, { kind: "maxSteps", value: 2 }, { kind: "forbiddenTopic", value: "Спорт" }, { kind: "forbiddenTopic", value: "спорт" }, { kind: "x" }] });
  assert.deepEqual(p, { enabled: false, rules: [{ kind: "maxSteps", value: 10 }, { kind: "forbiddenTopic", value: "Спорт" }] });
});

test("effective guardrails follow the switch", () => {
  const rules = parseRules(["maskPii", { maxSteps: 3 }, { forbiddenTopic: "политика" }]);
  assert.deepEqual(effectiveGuardrails({ enabled: true, rules }), { maskPii: true, maxSteps: 3, forbiddenTopics: ["политика"] });
  assert.deepEqual(effectiveGuardrails({ enabled: false, rules }), { maskPii: false, maxSteps: 5, forbiddenTopics: [] });
  assert.deepEqual(agentGuardrails('{"enabled":true,"rules":[]}'), { maskPii: false, maxSteps: 5, forbiddenTopics: [] });
});

test("rules ↔ YAML items and labels", () => {
  const rules = parseRules(["maskPii", { maxSteps: 4 }, { forbiddenTopic: "политика" }]);
  assert.deepEqual(rulesToYaml(rules), ["maskPii", { maxSteps: 4 }, { forbiddenTopic: "политика" }]);
  assert.deepEqual(rules.map(ruleLabel), ["Маскирование ПДн", "Лимит шагов — 4", "Запрещённая тема — политика"]);
});

test("MCP access defaults to read", () => {
  assert.deepEqual(parseMcpAccess('{"c1":"send","c2":"write","c3":1}'), { c1: "send", c2: "read", c3: "read" });
  assert.deepEqual(parseMcpAccess("[]"), {});
});
