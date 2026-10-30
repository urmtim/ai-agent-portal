import { test } from "node:test";
import assert from "node:assert/strict";
import { modelToYaml, yamlToModel } from "./model-spec";

test("model round-trips through YAML with its description, without a token", () => {
  const spec = { name: "Ollama Cloud", description: "Облачная модель для чата и агентов", baseUrl: "https://ollama.com/v1", model: "gpt-oss:120b", contextTokens: 128000 };
  const y = modelToYaml(spec);
  assert.ok(y.includes("model: gpt-oss:120b") && y.includes("description: Облачная модель") && !y.includes("default") && !/token:/i.test(y.replace("Токен", "")), y);
  const back = yamlToModel(y);
  assert.ok("spec" in back);
  assert.deepEqual(back.spec, spec);
  assert.deepEqual(back.warnings, []);
});

test("a token in YAML is ignored with a warning; context clamped", () => {
  const r = yamlToModel("name: X\nbaseUrl: http://localhost:11434/v1\nmodel: llama3\ntoken: sk-secret\ncontextTokens: 10");
  assert.ok("spec" in r);
  assert.equal(r.spec.contextTokens, 2000);
  assert.equal(r.spec.description, "");
  assert.deepEqual(r.warnings, ["Токен из YAML не берётся — введите его на вкладке «Параметры»"]);
  assert.ok(!JSON.stringify(r.spec).includes("sk-secret"));
});

test("an old file with `default:` still loads", () => {
  const r = yamlToModel("version: 1\nname: GLM\nbaseUrl: https://glm/v1\nmodel: glm-4\ncontextTokens: 32000\ndefault: true\n");
  assert.ok("spec" in r);
  assert.equal(r.spec.model, "glm-4");
  assert.deepEqual(r.warnings, []);
});

test("broken YAML is an error", () => {
  assert.ok("error" in yamlToModel("name: [unclosed"));
  assert.ok("error" in yamlToModel("- list"));
});
