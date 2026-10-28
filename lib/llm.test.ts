import { test } from "node:test";
import assert from "node:assert/strict";
import { pickModel, type ModelChoice, type RegistryModel } from "./llm-pick";

const glm: RegistryModel = { id: "g", name: "GLM-4", baseUrl: "https://glm/v1", model: "glm-4", tokenEnc: "v1:x", isDefault: true };
const llama: RegistryModel = { id: "l", name: "Llama", baseUrl: "http://localhost:11434/v1", model: "llama3.1", tokenEnc: null, isDefault: false };
const env: ModelChoice = { source: "env", name: "qwen", baseUrl: "http://env/v1", model: "qwen" };

test("agent's own model wins", () => {
  assert.equal(pickModel([glm, llama], "l", env)?.name, "Llama");
});

test("no own model → default", () => {
  assert.equal(pickModel([llama, glm], null, env)?.name, "GLM-4");
});

test("own model deleted → default", () => {
  assert.equal(pickModel([glm, llama], "gone", env)?.name, "GLM-4");
});

test("no default flag → earliest model", () => {
  assert.equal(pickModel([{ ...llama }, { ...glm, isDefault: false }], null, env)?.name, "Llama");
});

test("empty registry → .env model", () => {
  assert.deepEqual(pickModel([], null, env), env);
  assert.deepEqual(pickModel([], "l", env), env);
});

test("nothing configured → null", () => {
  assert.equal(pickModel([], null, null), null);
});
