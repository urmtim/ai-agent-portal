import { test } from "node:test";
import assert from "node:assert/strict";
import { compactOutput, estimateTokens, lastUserIndex, planSummary, summaryInput, trimToolResults, type Msg } from "./context";

const letters = { mailbox: "Моя почта", total: 2, letters: [
  { id: 1, date: "2026-10-28", from: "bank@bank.test", subject: "Выписка", snippet: "Ваш баланс 12 345 ₽", unread: true },
  { id: 2, date: "2026-10-28", from: "petya@x.test", subject: "Встреча", snippet: "В пятницу в 19:00", unread: false },
] };
const user = (id: string, text: string): Msg => ({ id, role: "user", parts: [{ type: "text", text }] });
const bot = (id: string, text: string, extra: unknown[] = []): Msg => ({ id, role: "assistant", parts: [...extra, { type: "text", text }] });
const search = { type: "tool-mail_search", toolCallId: "c1", state: "output-available", input: { days: 7 }, output: letters };

test("compactOutput: letters lose their text, a long letter is cut, an agent run loses its log", () => {
  assert.deepEqual((compactOutput("mail_search", letters) as typeof letters).letters[0], { id: 1, date: "2026-10-28", from: "bank@bank.test", subject: "Выписка" });
  const long = compactOutput("mail_read", { mailbox: "m", letter: { id: 1, subject: "s", text: "а".repeat(1000) } }) as { letter: { text: string } };
  assert.equal(long.letter.text, "а".repeat(300) + "… [в истории чата сокращено; целиком — прочитай снова тем же инструментом]");
  assert.deepEqual(compactOutput("run_agent", { agent: "A", status: "ok", summary: "итог", processed: 1, created: 0, log: "много" }),
    { agent: "A", status: "ok", summary: "итог", processed: 1, created: 0 });
  assert.deepEqual(compactOutput("mail_search", { error: "нет почты" }), { error: "нет почты" });
});

test("trimToolResults: only before the current question, without touching the originals", () => {
  const msgs = [user("u1", "Что на почте?"), bot("a1", "Два письма", [search]), user("u2", "А ещё?"), bot("a2", "Вот", [search])];
  const out = trimToolResults(msgs, lastUserIndex(msgs));
  assert.equal(lastUserIndex(msgs), 2);
  assert.ok(!JSON.stringify(out[1]).includes("snippet"));
  assert.ok(JSON.stringify(out[3]).includes("snippet")); // current turn stays full
  assert.ok(JSON.stringify(msgs[1]).includes("snippet")); // saved history unchanged
  assert.equal(out[0], msgs[0]);
});

test("planSummary: nothing while it fits, then a cut on a user message before the current question", () => {
  const msgs: Msg[] = [];
  for (let i = 0; i < 10; i++) msgs.push(user(`u${i}`, `вопрос ${i} ` + "x".repeat(300)), bot(`a${i}`, `ответ ${i} ` + "y".repeat(300)));
  const total = estimateTokens(msgs);
  assert.equal(planSummary({ messages: msgs, summaryUpto: 0, budget: total * 2, fixedTokens: 0 }), 0);
  const cut = planSummary({ messages: msgs, summaryUpto: 0, budget: total, fixedTokens: 0 });
  assert.ok(cut > 0 && cut <= 18 && msgs[cut].role === "user", String(cut));
  assert.ok(estimateTokens(msgs.slice(cut)) <= 0.4 * total);
  // tiny budget: everything up to the current question
  assert.equal(planSummary({ messages: msgs, summaryUpto: 0, budget: 10, fixedTokens: 0 }), 18);
  // already retold up to the current question: nothing more to cut
  assert.equal(planSummary({ messages: msgs, summaryUpto: 18, budget: 10, fixedTokens: 0 }), 18);
});

test("summaryInput: who said what, tool results short", () => {
  const t = summaryInput([user("u1", "Что на почте?"), bot("a1", "Два письма", [search])]);
  assert.ok(t.startsWith("Пользователь: Что на почте?\n[mail_search] {"), t);
  assert.ok(t.endsWith("Ассистент: Два письма"));
  assert.ok(!t.includes("snippet"));
});
