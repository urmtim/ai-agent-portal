import { test } from "node:test";
import assert from "node:assert/strict";
import { takeResponse } from "./pop3";

test("single-line replies", () => {
  assert.deepEqual(takeResponse("+OK 3 120\r\nrest", false), { reply: { ok: true, text: "3 120", lines: [] }, rest: "rest" });
  assert.deepEqual(takeResponse("-ERR invalid password\r\n", false)?.reply, { ok: false, text: "invalid password", lines: [] });
  assert.equal(takeResponse("+OK partial", false), null);
});

test("multi-line replies wait for the dot and unstuff «..»", () => {
  assert.equal(takeResponse("+OK\r\nSubject: a\r\n", true), null);
  const r = takeResponse("+OK message follows\r\nSubject: a\r\n\r\n..dot line\r\nbody\r\n.\r\n+OK next", true);
  assert.deepEqual(r?.reply.lines, ["Subject: a", "", ".dot line", "body"]);
  assert.equal(r?.rest, "+OK next");
});

test("an empty multi-line reply and -ERR to a multi-line command", () => {
  assert.deepEqual(takeResponse("+OK\r\n.\r\n", true), { reply: { ok: true, text: "", lines: [] }, rest: "" });
  assert.deepEqual(takeResponse("-ERR no such message\r\n", true)?.reply, { ok: false, text: "no such message", lines: [] });
});
