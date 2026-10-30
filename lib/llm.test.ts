import { test } from "node:test";
import assert from "node:assert/strict";
import { noModelMessage, pickModel, type ModelChoice, type RegistryModel } from "./llm-pick";

const glm: RegistryModel = { id: "g", name: "GLM-4", baseUrl: "https://glm/v1", model: "glm-4", tokenEnc: "v1:x", contextTokens: 128000 };
const llama: RegistryModel = { id: "l", name: "Llama", baseUrl: "http://localhost:11434/v1", model: "llama3.1", tokenEnc: null, contextTokens: 8000 };
const env: ModelChoice = { source: "env", name: "qwen", baseUrl: "http://env/v1", model: "qwen", contextTokens: 32000 };

test("agent's own model wins", () => {
  assert.equal((pickModel([glm, llama], "l", env) as ModelChoice).name, "Llama");
});

test("no own model → no substitute, even with models and .env", () => {
  assert.deepEqual(pickModel([glm, llama], null, env), { none: "not-chosen" });
});

test("own model gone → no substitute", () => {
  assert.deepEqual(pickModel([glm, llama], "gone", env), { none: "not-chosen" });
});

test("empty registry → .env model", () => {
  assert.deepEqual(pickModel([], null, env), env);
  assert.deepEqual(pickModel([], "l", env), env);
});

test("nothing configured", () => {
  assert.deepEqual(pickModel([], null, null), { none: "nothing" });
});

test("messages say what to do", () => {
  assert.match(noModelMessage({ none: "nothing" }), /добавьте модель/);
  assert.match(noModelMessage({ none: "not-chosen" }), /Модель не выбрана/);
});
