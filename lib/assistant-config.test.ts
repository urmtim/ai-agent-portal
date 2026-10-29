import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedTools, parseAssistant } from "./assistant-config";

const known = { agentIds: ["a1", "a2"], mcpIds: [], modelIds: ["m1"] };

test("no settings yet → nothing allowed, default model", () => {
  assert.deepEqual(parseAssistant(null, known), { modelId: null, agentIds: [], mcpIds: [], mcpAccess: {}, apis: [] });
});

test("keeps only what still exists, drops junk (incl. the removed «Траты» API)", () => {
  const cfg = parseAssistant({ modelId: "gone", agentIds: '["a2","deleted","a2",5]', mcpIds: '["x"]', apis: '["spending","toString"]' }, known);
  assert.deepEqual(cfg, { modelId: null, agentIds: ["a2"], mcpIds: [], mcpAccess: {}, apis: [] });
  assert.equal(parseAssistant({ modelId: "m1", agentIds: "{bad", mcpIds: "", apis: "[]" }, known).modelId, "m1");
  assert.deepEqual(parseAssistant({ modelId: null, agentIds: "{bad", mcpIds: "", apis: "null" }, known).agentIds, []);
});

test("allowedTools follows the table parts; run_agent only with an allowed enabled agent", () => {
  assert.deepEqual(allowedTools({ modelId: null, agentIds: [], mcpIds: [], apis: [] }, ["a1"]), []);
  assert.deepEqual(allowedTools({ modelId: null, agentIds: ["a1"], mcpIds: [], apis: [] }, ["a1"]), ["run_agent"]);
  assert.deepEqual(allowedTools({ modelId: null, agentIds: ["a2"], mcpIds: [], apis: [] }, ["a1"]), []); // a2 is off
});

test("a «Почта» connection on the MCP tab unlocks the mail tools", () => {
  assert.deepEqual(allowedTools({ modelId: null, agentIds: [], mcpIds: ["c1"], apis: [] }, [], ["c1"]), ["mail_search", "mail_read"]);
  assert.deepEqual(allowedTools({ modelId: null, agentIds: [], mcpIds: ["c1"], apis: [] }, [], ["c2"]), []); // not mail
  assert.deepEqual(allowedTools({ modelId: null, agentIds: [], mcpIds: [], apis: [] }, [], ["c1"]), []);
});
