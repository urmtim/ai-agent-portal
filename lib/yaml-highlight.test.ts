import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightYaml } from "./yaml-highlight";

test("keys, strings, literals, comments", () => {
  const h = highlightYaml("# агент\nname: Сводка\nenabled: true\nmaxSteps: 5");
  assert.ok(h.includes('<span class="y-com"># агент</span>'));
  assert.ok(h.includes('<span class="y-key">name</span><span class="y-pun">:</span> <span class="y-str">Сводка</span>'));
  assert.ok(h.includes('<span class="y-lit">true</span>') && h.includes('<span class="y-lit">5</span>'));
});

test("block text after «|-» stays text, even with a colon", () => {
  const h = highlightYaml("instruction: |-\n  Составь сводку: от кого\nhitl:\n  enabled: false");
  assert.ok(h.includes('<span class="y-str">  Составь сводку: от кого</span>'), h);
  assert.ok(h.includes('<span class="y-key">hitl</span>'));
});

test("list items and escaping", () => {
  const h = highlightYaml("rules:\n  - maskPii\n  - forbiddenTopic: <b>x</b>");
  assert.ok(h.includes('<span class="y-pun">- </span><span class="y-str">maskPii</span>'));
  assert.ok(h.includes("&lt;b&gt;x&lt;/b&gt;") && !h.includes("<b>"));
});
