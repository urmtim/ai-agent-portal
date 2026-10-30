import { test } from "node:test";
import assert from "node:assert/strict";
import { toolErrorText } from "./tool-errors";

const raw = `AI_InvalidToolInputError: Invalid input for tool mail_search: AI_TypeValidationError: Type validation failed: Value: {"days":365,"from":"","limit":1000,"query":"","unreadOnly":false}.
Error message: [
  { "origin": "number", "code": "too_big", "maximum": 90, "inclusive": true, "path": ["days"], "message": "Too big: expected number to be <=90" },
  { "origin": "number", "code": "too_big", "maximum": 20, "inclusive": true, "path": ["limit"], "message": "Too big: expected number to be <=20" }
]`;

test("wrong tool input → what the model asked and what is allowed", () => {
  assert.equal(toolErrorText("mail_search", raw), [
    "Модель передала инструменту неверные параметры, и он не запустился:",
    "- Период: модель запросила 365 дн., можно не больше 90 дн.",
    "- Писем за раз: модель запросила 1000, можно не больше 20",
    "Это лимит коннектора: его меняют на вкладке «Лимиты».",
  ].join("\n"));
});

test("a missing parameter and an unknown one", () => {
  const t = `AI_InvalidToolInputError: Invalid input for tool mail_read: AI_TypeValidationError: Type validation failed: Value: {}.
Error message: [{ "code": "invalid_type", "path": ["id"], "message": "Invalid input: expected number, received undefined" }]`;
  assert.equal(toolErrorText("mail_read", t), "Модель передала инструменту неверные параметры, и он не запустился:\n- Номер письма: не указан");
});

test("other errors are shown as they came", () => {
  assert.equal(toolErrorText("mail_search", "Почта не добавлена"), "Почта не добавлена");
  assert.equal(toolErrorText("mail_search", undefined), "Ошибка");
});
