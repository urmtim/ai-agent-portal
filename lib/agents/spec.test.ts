import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_SPEC, specToYaml, yamlToSpec } from "./spec";

const known = { models: ["Ollama Cloud"], connections: ["Моя почта"], agents: ["Чеки из почты"], apis: [] };

test("custom agent round-trips through YAML", () => {
  const spec = {
    ...EMPTY_SPEC, name: "Разбор почты", model: "Ollama Cloud", instruction: "Составь сводку новых писем.\nКоротко.",
    hitl: "none" as const, guardrails: { maskPii: true, maxSteps: 3, forbiddenTopics: ["политика"] }, mcp: ["Моя почта"], agents: ["Чеки из почты"],
  };
  const yaml = specToYaml(spec);
  assert.ok(yaml.includes("instruction: |"), yaml);
  assert.ok(!yaml.includes("receipts:"));
  const back = yamlToSpec(yaml, known);
  assert.ok("spec" in back);
  assert.deepEqual(back.spec, spec);
  assert.deepEqual(back.warnings, []);
});

test("receipts agent keeps its settings, not instruction", () => {
  const yaml = specToYaml({ ...EMPTY_SPEC, name: "Чеки", type: "receipts", receipts: { sinceDays: 14, max: 20, fromFilter: "ozon" } });
  assert.ok(!yaml.includes("instruction"));
  const back = yamlToSpec(yaml, known);
  assert.ok("spec" in back && back.spec.type === "receipts" && back.spec.receipts.sinceDays === 14 && back.spec.receipts.fromFilter === "ozon");
});

test("unknown names become warnings and are skipped", () => {
  const r = yamlToSpec("name: X\nmodel: GPT-9\nmcp: [Моя почта, Рабочая почта]\nagents: [Нет такого]\n", known);
  assert.ok("spec" in r);
  assert.equal(r.spec.model, null);
  assert.deepEqual(r.spec.mcp, ["Моя почта"]);
  assert.deepEqual(r.spec.agents, []);
  assert.deepEqual(r.warnings, ["Модель «GPT-9» не найдена — будет модель по умолчанию", "Подключение «Рабочая почта» не найдено — пропущено", "Агент «Нет такого» не найден — пропущен"]);
});

test("broken YAML is an error, not a crash", () => {
  assert.ok("error" in yamlToSpec("name: [unclosed", known));
  assert.ok("error" in yamlToSpec("- just a list", known));
  const r = yamlToSpec("hitl: maybe\nguardrails: {maxSteps: 99}", known);
  assert.ok("spec" in r && r.spec.hitl === "confirm" && r.spec.guardrails.maxSteps === 10);
});
