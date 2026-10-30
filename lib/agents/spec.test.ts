import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_SPEC, specToYaml, yamlToSpec, type AgentSpec } from "./spec";

const docs = [{ id: "d1", name: "Регламент" }];
const known = { models: ["Ollama Cloud"], connectors: ["Моя почта"], agents: ["Ответы на письма"], documents: docs };

test("agent round-trips through YAML", () => {
  const spec: AgentSpec = {
    ...EMPTY_SPEC, name: "Разбор почты", description: "Утренняя сводка", model: "Ollama Cloud", instruction: "Составь сводку новых писем.\nКоротко.",
    hitl: "off",
    guardrails: [{ kind: "maskPii" }, { kind: "maxSteps", value: 3 }, { kind: "forbiddenTopic", value: "политика" }, { kind: "document", id: "d1" }],
    agents: ["Ответы на письма"], connectors: ["Моя почта"],
  };
  const yaml = specToYaml(spec, docs);
  assert.ok(yaml.includes("instruction: |") && yaml.includes("description: Утренняя сводка"), yaml);
  assert.ok(yaml.includes("hitl: off") && yaml.includes("- maskPii") && yaml.includes("maxSteps: 3") && yaml.includes("document: Регламент"), yaml);
  assert.ok(!yaml.includes("type:") && !yaml.includes("enabled: true\n  rules") && !yaml.includes("mcp:") && !yaml.includes("api:"), yaml);
  assert.ok(yaml.includes("connectors:\n  - Моя почта"), yaml);
  const back = yamlToSpec(yaml, known);
  assert.ok("spec" in back);
  assert.deepEqual(back.spec, spec);
  assert.deepEqual(back.warnings, []);
});

test("versions 1–3 are still read: old «mcp:» mailboxes become connectors, «api:» is dropped", () => {
  const v1 = yamlToSpec("name: Старый\ntype: custom\nhitl: none\nguardrails: {maskPii: false, maxSteps: 4, forbiddenTopics: [спорт]}\nmcp: [Моя почта]\n", known);
  assert.ok("spec" in v1);
  assert.equal(v1.spec.hitl, "off");
  assert.deepEqual(v1.spec.guardrails, [{ kind: "maxSteps", value: 4 }, { kind: "forbiddenTopic", value: "спорт" }]);
  assert.deepEqual(v1.spec.connectors, ["Моя почта"]);
  const v2 = yamlToSpec("name: Второй\nhitl: {enabled: true, ask: send_only}\nguardrails: {enabled: true, rules: [maskPii, {maxSteps: 2}]}\n", known);
  assert.ok("spec" in v2 && v2.spec.hitl === "send_only" && v2.spec.guardrails.length === 2);
  const v3 = yamlToSpec("version: 3\nname: Третий\nmcp:\n  - name: Моя почта\n    access: send\napi: []\n", known);
  assert.ok("spec" in v3);
  assert.deepEqual(v3.spec.connectors, ["Моя почта"]);
  assert.deepEqual(v3.warnings, []);
});

test("unknown names become warnings and are skipped", () => {
  const r = yamlToSpec("name: X\nmodel: GPT-9\nmcp: [Моя почта, {name: Рабочая почта, access: send}]\nagents: [Нет такого]\nguardrails: [{document: Нет документа}, maskPii]\n", known);
  assert.ok("spec" in r);
  assert.equal(r.spec.model, null);
  assert.deepEqual(r.spec.connectors, ["Моя почта"]);
  assert.deepEqual(r.spec.guardrails, [{ kind: "maskPii" }]);
  assert.deepEqual(r.warnings, ["Модель «GPT-9» не найдена — остаётся выбранная в окне", "Документ «Нет документа» не найден — пропущен",
    "Агент «Нет такого» не найден — пропущен", "Коннектор «Рабочая почта» не найден — пропущен"]);
});

test("receipts type becomes a warning; broken YAML is an error", () => {
  const r = yamlToSpec("name: Чеки\ntype: receipts\n", known);
  assert.ok("spec" in r && r.warnings.some((w) => w.includes("«Чеки из почты» больше нет")));
  assert.ok("error" in yamlToSpec("name: [unclosed", known));
  assert.ok("error" in yamlToSpec("- just a list", known));
  const c = yamlToSpec("hitl: maybe\nguardrails: [{maxSteps: 99}]", known);
  assert.ok("spec" in c && c.spec.hitl === "changes_and_send" && c.spec.guardrails[0].kind === "maxSteps" && (c.spec.guardrails[0] as { value: number }).value === 10);
});
