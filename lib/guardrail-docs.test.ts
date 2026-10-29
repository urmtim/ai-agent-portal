import { test } from "node:test";
import assert from "node:assert/strict";
import { docKind, docsInstructions, extractDocText, fileLabel, fileProblem, MAX_DOC_TEXT, tidyText } from "./guardrail-docs";

test("accepted files", () => {
  assert.equal(docKind("Регламент.DOCX"), "docx");
  assert.equal(docKind("a.pdf"), "pdf");
  assert.equal(docKind("photo.png"), null);
  assert.equal(fileProblem("photo.png", 10), "Подходят файлы docx, pdf, txt и md");
  assert.equal(fileProblem("big.pdf", 5 * 1024 * 1024), "Файл больше 4 МБ");
  assert.equal(fileProblem("ok.md", 100), null);
  assert.equal(fileLabel("Регламент.docx", 12 * 1024), "Регламент.docx · 12 КБ");
  assert.equal(fileLabel("big.pdf", 1.5 * 1024 * 1024), "big.pdf · 1,5 МБ");
});

test("text of txt/md, tidied and capped", async () => {
  assert.equal(await extractDocText("r.md", new TextEncoder().encode("# Правила\r\n\r\n\r\n\r\nНе называй суммы.  \n")), "# Правила\n\nНе называй суммы.");
  await assert.rejects(extractDocText("empty.txt", new TextEncoder().encode("   \n ")), /нет текста/);
  assert.ok(tidyText("я".repeat(MAX_DOC_TEXT + 10)).endsWith("…"));
});

test("documents for the model", () => {
  assert.equal(docsInstructions([]), "");
  const t = docsInstructions([{ name: "Регламент", text: "Не называй суммы." }]);
  assert.ok(t.startsWith("Обязательные правила из документов") && t.includes("«Регламент»") && t.includes("Не называй суммы."));
});
