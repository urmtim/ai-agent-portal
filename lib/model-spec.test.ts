import { test } from "node:test";
import assert from "node:assert/strict";
import { modelToYaml, yamlToModel } from "./model-spec";

test("model round-trips through YAML, without a token", () => {
  const spec = { name: "Ollama Cloud", baseUrl: "https://ollama.com/v1", model: "gpt-oss:120b", contextTokens: 128000, isDefault: true };
  const y = modelToYaml(spec);
  assert.ok(y.includes("model: gpt-oss:120b") && y.includes("default: true") && !/token:/i.test(y.replace("Токен", "")), y);
  const back = yamlToModel(y);
  assert.ok("spec" in back);
  assert.deepEqual(back.spec, spec);
  assert.deepEqual(back.warnings, []);
});

test("a token in YAML is ignored with a warning; context clamped", () => {
  const r = yamlToModel("name: X\nbaseUrl: http://localhost:11434/v1\nmodel: llama3\ntoken: sk-secret\ncontextTokens: 10");
  assert.ok("spec" in r);
  assert.equal(r.spec.contextTokens, 2000);
  assert.deepEqual(r.warnings, ["Токен из YAML не берётся — введите его на вкладке «Общее»"]);
  assert.ok(!JSON.stringify(r.spec).includes("sk-secret"));
});

test("broken YAML is an error", () => {
  assert.ok("error" in yamlToModel("name: [unclosed"));
  assert.ok("error" in yamlToModel("- list"));
});
