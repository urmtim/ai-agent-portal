import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PINS, NAV_GROUPS, movePin, navKeyForPath, parsePins, unpin, visiblePins } from "./nav";

test("parsePins: nothing saved → default menu", () => {
  assert.deepEqual(parsePins(null), DEFAULT_PINS);
  assert.deepEqual(parsePins(""), DEFAULT_PINS);
});

test("parsePins: broken data → default menu", () => {
  assert.deepEqual(parsePins("{not json"), DEFAULT_PINS);
  assert.deepEqual(parsePins('{"a":1}'), DEFAULT_PINS);
  assert.deepEqual(parsePins("[]"), DEFAULT_PINS);
});

test("parsePins: unknown keys and duplicates dropped", () => {
  assert.deepEqual(parsePins('["stats","settings","chat","stats",7]'), ["stats", "chat"]);
  assert.deepEqual(parsePins('["gone"]'), DEFAULT_PINS);
});

test("parsePins: saved order kept", () => {
  assert.deepEqual(parsePins('["models","chat","agents","mcp"]'), ["models", "chat", "agents", "mcp"]);
});

test("movePin: pin from tray between chat and agents", () => {
  assert.deepEqual(movePin(DEFAULT_PINS, "stats", 1), ["chat", "stats", "agents", "models", "mcp", "api"]);
});

test("movePin: reorder models to the start", () => {
  assert.deepEqual(movePin(DEFAULT_PINS, "models", 0), ["models", "chat", "agents", "mcp", "api"]);
});

test("movePin: index past the end appends", () => {
  assert.deepEqual(movePin(DEFAULT_PINS, "chat", 99), ["agents", "models", "mcp", "api", "chat"]);
});

test("unpin: removes the item, keeps the last one", () => {
  assert.deepEqual(unpin(DEFAULT_PINS, "mcp"), ["chat", "agents", "models", "api"]);
  assert.deepEqual(unpin(["chat"], "chat"), ["chat"]);
});

test("visiblePins: admin items hidden from non-admins", () => {
  const pins = ["chat", "users", "access"] as const;
  assert.deepEqual(visiblePins([...pins], false), ["chat"]);
  assert.deepEqual(visiblePins([...pins], true), ["chat", "users", "access"]);
});

test("navKeyForPath: sections and child pages", () => {
  assert.equal(navKeyForPath("/"), "learn");
  assert.equal(navKeyForPath("/courses/safe/03-principles"), "learn");
  assert.equal(navKeyForPath("/agents"), "agents");
  assert.equal(navKeyForPath("/agents/abc"), "agents");
  assert.equal(navKeyForPath("/admin/users"), "users");
  assert.equal(navKeyForPath("/admin/log"), "log");
  assert.equal(navKeyForPath("/stats"), "stats");
  assert.equal(navKeyForPath("/statsx"), undefined);
});

test("parsePins: an untouched old default menu becomes the new default, a custom one stays", () => {
  assert.deepEqual(parsePins('["chat","agents","mcp","models"]'), ["chat", "agents", "models", "mcp", "api"]);
  assert.deepEqual(parsePins('["chat","models","agents","mcp","api"]'), ["chat", "agents", "models", "mcp", "api"]);
  assert.deepEqual(parsePins('["chat","stats","agents"]'), ["chat", "stats", "agents"]);
  assert.deepEqual(parsePins('["agents","chat","mcp","models"]'), ["agents", "chat", "mcp", "models"]);
});

test("AI group order, API and guardrails sections", () => {
  assert.deepEqual(NAV_GROUPS.find((g) => g.title === "AI")?.items, ["agents", "models", "mcp", "api", "guardrails"]);
  assert.equal(navKeyForPath("/api-access"), "api");
  assert.equal(navKeyForPath("/guardrails"), "guardrails");
});
