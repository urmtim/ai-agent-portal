import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUserChange, statusFor, type GuardUser } from "./user-guard";

const admin: GuardUser = { id: "a", role: "ADMIN", status: "ACTIVE" };
const admin2: GuardUser = { id: "b", role: "ADMIN", status: "ACTIVE" };
const user: GuardUser = { id: "u", role: "USER", status: "ACTIVE" };

test("cannot delete yourself", () => {
  assert.equal(checkUserChange({ actorId: "a", target: admin, change: { kind: "delete" }, activeAdminCount: 2 }), "Нельзя удалить самого себя");
});

test("cannot disable yourself or drop your own admin role", () => {
  assert.equal(checkUserChange({ actorId: "a", target: admin, change: { kind: "update", role: "ADMIN", canLogin: false }, activeAdminCount: 2 }), "Нельзя отключить самого себя");
  assert.equal(checkUserChange({ actorId: "a", target: admin, change: { kind: "update", role: "USER", canLogin: true }, activeAdminCount: 2 }), "Нельзя снять роль администратора с самого себя");
});

test("cannot demote, disable or delete the last active admin", () => {
  const last = "Нельзя убрать последнего администратора";
  assert.equal(checkUserChange({ actorId: "x", target: admin2, change: { kind: "update", role: "USER", canLogin: true }, activeAdminCount: 1 }), last);
  assert.equal(checkUserChange({ actorId: "x", target: admin2, change: { kind: "update", role: "ADMIN", canLogin: false }, activeAdminCount: 1 }), last);
  assert.equal(checkUserChange({ actorId: "x", target: admin2, change: { kind: "delete" }, activeAdminCount: 1 }), last);
});

test("another admin can be demoted while one stays", () => {
  assert.equal(checkUserChange({ actorId: "a", target: admin2, change: { kind: "update", role: "USER", canLogin: true }, activeAdminCount: 2 }), null);
  assert.equal(checkUserChange({ actorId: "a", target: admin2, change: { kind: "delete" }, activeAdminCount: 2 }), null);
});

test("ordinary edits and deletes pass", () => {
  assert.equal(checkUserChange({ actorId: "a", target: user, change: { kind: "update", role: "USER", canLogin: false }, activeAdminCount: 1 }), null);
  assert.equal(checkUserChange({ actorId: "a", target: user, change: { kind: "delete" }, activeAdminCount: 1 }), null);
  assert.equal(checkUserChange({ actorId: "a", target: admin, change: { kind: "update", role: "ADMIN", canLogin: true }, activeAdminCount: 1 }), null);
});

test("statusFor", () => {
  assert.equal(statusFor(false, true), "DISABLED");
  assert.equal(statusFor(true, true), "ACTIVE");
  assert.equal(statusFor(true, false), "INVITED");
});
