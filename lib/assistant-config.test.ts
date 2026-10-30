import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedTools, parseAssistant } from "./assistant-config";

const known = { agentIds: ["a1", "a2"], connectorIds: ["c1"], modelIds: ["m1"] };

test("no settings yet → nothing allowed, no model", () => {
  assert.deepEqual(parseAssistant(null, known), { modelId: null, agentIds: [], connectorIds: [], instruction: "", hitl: "changes_and_send",
    guardrails: [{ kind: "maskPii" }, { kind: "maxSteps", value: 5 }] });
});

test("keeps only what still exists, drops junk", () => {
  const cfg = parseAssistant({ modelId: "gone", agentIds: '["a2","deleted","a2",5]', connectorIds: '["c1","x"]' }, known);
  assert.deepEqual({ modelId: cfg.modelId, agentIds: cfg.agentIds, connectorIds: cfg.connectorIds }, { modelId: null, agentIds: ["a2"], connectorIds: ["c1"] });
  assert.equal(parseAssistant({ modelId: "m1", agentIds: "{bad" }, known).modelId, "m1");
  assert.deepEqual(parseAssistant({ modelId: null, agentIds: "{bad", connectorIds: "null" }, known).connectorIds, []);
});

test("allowedTools follows the table parts; run_agent only with an allowed enabled agent", () => {
  assert.deepEqual(allowedTools({ agentIds: [], connectorIds: [] }, ["a1"]), []);
  assert.deepEqual(allowedTools({ agentIds: ["a1"], connectorIds: [] }, ["a1"]), ["run_agent"]);
  assert.deepEqual(allowedTools({ agentIds: ["a2"], connectorIds: [] }, ["a1"]), []); // a2 is off
});

test("an allowed switched-on «Почта» connector unlocks the tools its «Инструменты» tab gives", () => {
  const mail = { id: "c1", tools: ["mail_search", "mail_read", "mail_move"] };
  assert.deepEqual(allowedTools({ agentIds: [], connectorIds: ["c1"] }, [], mail), ["mail_search", "mail_read", "mail_move"]);
  assert.deepEqual(allowedTools({ agentIds: [], connectorIds: ["c1"] }, [], null), []); // not mail, or switched off
  assert.deepEqual(allowedTools({ agentIds: [], connectorIds: [] }, [], mail), []);
  assert.deepEqual(allowedTools({ agentIds: [], connectorIds: ["c1"] }, [], { id: "c1", tools: [] }), []); // every tool switched off
});
