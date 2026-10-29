import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_SPEC, specToYaml, yamlToSpec, type AgentSpec } from "./spec";

const known = { models: ["Ollama Cloud"], connections: ["Моя почта"], agents: ["Ответы на письма"], apis: [] };

test("agent round-trips through YAML", () => {
  const spec: AgentSpec = {
    ...EMPTY_SPEC, name: "Разбор почты", model: "Ollama Cloud", instruction: "Составь сводку новых писем.\nКоротко.",
    hitl: { enabled: false, ask: "send_only" },
    guardrails: { enabled: true, rules: [{ kind: "maskPii" }, { kind: "maxSteps", value: 3 }, { kind: "forbiddenTopic", value: "политика" }] },
    mcp: [{ name: "Моя почта", access: "send" }], agents: ["Ответы на письма"],
  };
  const yaml = specToYaml(spec);
  assert.ok(yaml.includes("instruction: |"), yaml);
  assert.ok(yaml.includes("- maskPii") && yaml.includes("maxSteps: 3") && yaml.includes("forbiddenTopic: политика"), yaml);
  assert.ok(!yaml.includes("type:") && !yaml.includes("receipts"));
  const back = yamlToSpec(yaml, known);
  assert.ok("spec" in back);
  assert.deepEqual(back.spec, spec);
  assert.deepEqual(back.warnings, []);
});

test("version 1 YAML is still read", () => {
  const r = yamlToSpec("name: Старый\ntype: custom\nhitl: none\nguardrails: {maskPii: false, maxSteps: 4, forbiddenTopics: [спорт]}\nmcp: [Моя почта]\n", known);
  assert.ok("spec" in r);
  assert.deepEqual(r.spec.hitl, { enabled: false, ask: "changes_and_send" });
  assert.deepEqual(r.spec.guardrails, { enabled: true, rules: [{ kind: "maxSteps", value: 4 }, { kind: "forbiddenTopic", value: "спорт" }] });
  assert.deepEqual(r.spec.mcp, [{ name: "Моя почта", access: "read" }]);
});

test("receipts type becomes a warning", () => {
  const r = yamlToSpec("name: Чеки\ntype: receipts\n", known);
  assert.ok("spec" in r && r.warnings.some((w) => w.includes("«Чеки из почты» больше нет")));
});

test("unknown names become warnings and are skipped", () => {
  const r = yamlToSpec("name: X\nmodel: GPT-9\nmcp: [Моя почта, {name: Рабочая почта, access: send}]\nagents: [Нет такого]\n", known);
  assert.ok("spec" in r);
  assert.equal(r.spec.model, null);
  assert.deepEqual(r.spec.mcp, [{ name: "Моя почта", access: "read" }]);
  assert.deepEqual(r.spec.agents, []);
  assert.deepEqual(r.warnings, ["Модель «GPT-9» не найдена — будет модель по умолчанию", "Подключение «Рабочая почта» не найдено — пропущено", "Агент «Нет такого» не найден — пропущен"]);
});

test("broken YAML is an error, not a crash", () => {
  assert.ok("error" in yamlToSpec("name: [unclosed", known));
  assert.ok("error" in yamlToSpec("- just a list", known));
  const r = yamlToSpec("hitl: maybe\nguardrails: {enabled: true, rules: [{maxSteps: 99}]}", known);
  assert.ok("spec" in r && r.spec.hitl.enabled === true && r.spec.guardrails.rules[0].kind === "maxSteps" && (r.spec.guardrails.rules[0] as { value: number }).value === 10);
});
