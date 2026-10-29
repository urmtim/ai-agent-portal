import { test } from "node:test";
import assert from "node:assert/strict";
import { agentGuardrails, effectiveGuardrails, guardDocIds, hitlAsks, parseGuardRules, parseHitl, parseMcpAccess, parseRules, ruleLabel, rulesToYaml } from "./policy";

test("parseHitl reads every stored form", () => {
  assert.equal(parseHitl("none"), "off");
  assert.equal(parseHitl("confirm"), "changes_and_send");
  assert.equal(parseHitl('{"enabled":false,"ask":"send_only"}'), "off");
  assert.equal(parseHitl('{"enabled":true,"ask":"send_only"}'), "send_only");
  assert.equal(parseHitl("send_only"), "send_only");
  assert.equal(parseHitl("garbage"), "changes_and_send");
  assert.equal(hitlAsks("off"), false);
  assert.equal(hitlAsks('"send_only"'), true);
});

test("old guardrails become rules; the switch is gone", () => {
  assert.deepEqual(parseGuardRules('{"maskPii":true,"maxSteps":3,"forbiddenTopics":["политика","медицина"]}'),
    [{ kind: "maskPii" }, { kind: "maxSteps", value: 3 }, { kind: "forbiddenTopic", value: "политика" }, { kind: "forbiddenTopic", value: "медицина" }]);
  assert.deepEqual(parseGuardRules("{}"), [{ kind: "maskPii" }, { kind: "maxSteps", value: 5 }]);
  assert.deepEqual(parseGuardRules('{"enabled":false,"rules":[{"kind":"maskPii"}]}'), [{ kind: "maskPii" }]);
});

test("rules: duplicates dropped, limit clamped, documents kept by id", () => {
  assert.deepEqual(parseRules([{ kind: "maxSteps", value: 50 }, { kind: "maxSteps", value: 2 }, { kind: "forbiddenTopic", value: "Спорт" }, { kind: "forbiddenTopic", value: "спорт" },
    { kind: "document", id: "d1" }, { kind: "document", id: "d1" }, { kind: "x" }]),
  [{ kind: "maxSteps", value: 10 }, { kind: "forbiddenTopic", value: "Спорт" }, { kind: "document", id: "d1" }]);
});

test("effective guardrails and document ids", () => {
  const rules = parseRules(["maskPii", { maxSteps: 3 }, { forbiddenTopic: "политика" }, { kind: "document", id: "d1" }]);
  assert.deepEqual(effectiveGuardrails(rules), { maskPii: true, maxSteps: 3, forbiddenTopics: ["политика"] });
  assert.deepEqual(guardDocIds(rules), ["d1"]);
  assert.deepEqual(agentGuardrails('{"rules":[]}'), { maskPii: false, maxSteps: 5, forbiddenTopics: [] });
});

test("rules ↔ YAML items and labels", () => {
  const rules = parseRules(["maskPii", { maxSteps: 4 }, { forbiddenTopic: "политика" }, { kind: "document", id: "d1" }, { kind: "document", id: "gone" }]);
  const name = (id: string) => (id === "d1" ? "Регламент" : undefined);
  assert.deepEqual(rulesToYaml(rules, name), ["maskPii", { maxSteps: 4 }, { forbiddenTopic: "политика" }, { document: "Регламент" }]);
  assert.deepEqual(rules.map((r) => ruleLabel(r, name)), ["Маскирование ПДн", "Лимит шагов — 4", "Запрещённая тема — политика", "Регламент", "Документ удалён"]);
});

test("MCP access defaults to read", () => {
  assert.deepEqual(parseMcpAccess('{"c1":"send","c2":"write","c3":1}'), { c1: "send", c2: "read", c3: "read" });
  assert.deepEqual(parseMcpAccess("[]"), {});
});
