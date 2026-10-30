import { test } from "node:test";
import assert from "node:assert/strict";
import { listMessage, listResult, modelNames, pingProblem } from "./model-list";

test("OpenAI and Ollama answers give sorted names without repeats", () => {
  assert.deepEqual(modelNames({ data: [{ id: "gpt-oss:20b" }, { id: "deepseek-v3.1:671b" }, { id: "gpt-oss:20b" }] }), ["deepseek-v3.1:671b", "gpt-oss:20b"]);
  assert.deepEqual(modelNames({ models: [{ name: "qwen2.5:7b" }, { model: "llama3.1:8b" }] }), ["llama3.1:8b", "qwen2.5:7b"]);
  assert.deepEqual(modelNames("not json"), []);
});

test("status and body → what the window says", () => {
  assert.equal(listMessage(listResult(200, { data: [{ id: "a" }, { id: "b" }] })), "✓ Список получен. Моделей: 2");
  assert.equal(listMessage(listResult(200, { data: [] })), "⚠ Список моделей недоступен — впишите вручную");
  assert.equal(listMessage(listResult(200, undefined)), "⚠ Список моделей недоступен — впишите вручную");
  assert.equal(listMessage(listResult(404, undefined)), "⚠ Список моделей недоступен — впишите вручную");
  assert.equal(listMessage(listResult(401, undefined)), "✕ Неверный токен");
  assert.equal(listMessage(listResult(403, undefined)), "✕ Неверный токен");
  assert.equal(listMessage(listResult(502, undefined)), "✕ Сервер ответил 502");
  assert.equal(listMessage({ kind: "down" }), "✕ Сервер не отвечает");
});

test("a failed test request on «Сохранить» goes under its field", () => {
  assert.equal(pingProblem({ ok: true, ms: 5, message: "✓" }, "m"), null);
  assert.deepEqual(pingProblem({ ok: false, ms: 5, status: 401, message: "✕ Сервер ответил 401" }, "m"), { field: "token", error: "Неверный токен" });
  assert.deepEqual(pingProblem({ ok: false, ms: 5, status: 403, message: "✕ Сервер ответил 403" }, "m"), { field: "token", error: "Неверный токен" });
  assert.deepEqual(pingProblem({ ok: false, ms: 5, status: 404, message: "✕ Сервер ответил 404" }, "бубубу"), { field: "model", error: "Сервер не знает модель «бубубу»" });
  assert.deepEqual(pingProblem({ ok: false, ms: 5, status: 400, message: "✕ Сервер ответил 400: model 'x' not found" }, "x"), { field: "model", error: "Сервер не знает модель «x»" });
  assert.deepEqual(pingProblem({ ok: false, ms: 5, message: "✕ Не удалось подключиться" }, "m"), { field: "baseUrl", error: "Сервер не отвечает" });
  assert.deepEqual(pingProblem({ ok: false, ms: 5, status: 500, message: "✕ Сервер ответил 500: boom" }, "m"), { field: "model", error: "Сервер ответил 500: boom" });
});
