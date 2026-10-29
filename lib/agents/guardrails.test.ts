import { test } from "node:test";
import assert from "node:assert/strict";
import { guardrailInstructions, maskDeep, maskPii, parseGuardrails } from "./guardrails";

test("maskPii replaces e-mail, phones, cards and passports", () => {
  assert.equal(maskPii("Пишите на ivan.petrov@mail.ru или звоните +7 912 345-67-89"), "Пишите на [почта] или звоните [телефон]");
  assert.equal(maskPii("тел. 8(495)123-45-67"), "тел. [телефон]");
  assert.equal(maskPii("карта 2200 1234 5678 9012"), "карта [карта]");
  assert.equal(maskPii("паспорт 4510 123456"), "паспорт [паспорт]");
  assert.equal(maskPii("заказ №12345 на 1 240 ₽"), "заказ №12345 на 1 240 ₽"); // ordinary numbers stay
});

test("maskDeep walks tool results", () => {
  assert.deepEqual(maskDeep({ letters: [{ from: "a@b.ru", n: 3 }], text: "звоните 89123456789" }),
    { letters: [{ from: "[почта]", n: 3 }], text: "звоните [телефон]" });
});

test("parseGuardrails: defaults, clamping, cleanup", () => {
  assert.deepEqual(parseGuardrails(""), { maskPii: true, maxSteps: 5, forbiddenTopics: [] });
  assert.deepEqual(parseGuardrails('{"maskPii":false,"maxSteps":50,"forbiddenTopics":[" политика ","политика","",3]}'),
    { maskPii: false, maxSteps: 10, forbiddenTopics: ["политика"] });
  assert.equal(parseGuardrails({ maxSteps: 0 }).maxSteps, 5);
});

test("guardrailInstructions mention forbidden topics and masking", () => {
  const t = guardrailInstructions({ maskPii: true, maxSteps: 3, forbiddenTopics: ["политика", "медицина"] });
  assert.ok(t.includes("политика, медицина"));
  assert.ok(t.includes("[телефон]"));
  assert.equal(guardrailInstructions({ maskPii: false, maxSteps: 3, forbiddenTopics: [] }), "");
});
