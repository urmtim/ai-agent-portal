import { test } from "node:test";
import assert from "node:assert/strict";
import { isAuditEvent, pageList, searchText } from "./audit-events";

test("searchText lower-cases Cyrillic and includes the event label", () => {
  assert.equal(searchText("Администратор", "login", "Вход в систему"), "администратор вход вход в систему");
  assert.ok(searchText("Маша", "model", "Добавлена модель «GLM»").includes("модель"));
});

test("isAuditEvent knows only catalog keys", () => {
  assert.equal(isAuditEvent("login"), true);
  assert.equal(isAuditEvent("toString"), false);
  assert.equal(isAuditEvent("nope"), false);
});

test("pageList: first, last, neighbours, gaps", () => {
  assert.deepEqual(pageList(1, 1), [1]);
  assert.deepEqual(pageList(1, 3), [1, 2, 3]);
  assert.deepEqual(pageList(5, 10), [1, "…", 4, 5, 6, "…", 10]);
  assert.deepEqual(pageList(10, 10), [1, "…", 9, 10]);
  assert.deepEqual(pageList(2, 7), [1, 2, 3, "…", 7]);
});
