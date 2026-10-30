import { test } from "node:test";
import assert from "node:assert/strict";
import { agentDesc } from "./types";

test("the list shows the agent's description, else the instruction's first line", () => {
  assert.equal(agentDesc({ type: "CUSTOM", description: " Утренняя сводка ", instruction: "Составь сводку.\nКоротко." }), "Утренняя сводка");
  assert.equal(agentDesc({ type: "CUSTOM", description: "", instruction: "Составь сводку.\nКоротко." }), "Составь сводку.");
  assert.equal(agentDesc({ type: "CUSTOM", instruction: "" }), "Работает по вашей инструкции с выбранными инструментами");
});
