// Guardrail documents: which files are accepted and their text (the text is what the model gets as binding rules).
// No "server-only": the checks are unit-tested (guardrail-docs.test.ts); the parsers are loaded only when a file comes in.

export const MAX_DOC_BYTES = 4 * 1024 * 1024;
/** How much of a document's text is kept and given to the model. */
export const MAX_DOC_TEXT = 20000;

const KINDS = {
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word" },
  pdf: { mime: "application/pdf", label: "PDF" },
  txt: { mime: "text/plain", label: "текст" },
  md: { mime: "text/markdown", label: "Markdown" },
} as const;
export type DocKind = keyof typeof KINDS;

export const DOC_ACCEPT = ".docx,.pdf,.txt,.md";

/** File name → kind by its extension, or null. */
export function docKind(fileName: string): DocKind | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return ext in KINDS ? (ext as DocKind) : null;
}

export const docMime = (k: DocKind) => KINDS[k].mime;

/** «Регламент.docx · 12 КБ» */
export function fileLabel(fileName: string, size: number): string {
  const kb = size / 1024;
  return `${fileName} · ${kb < 1024 ? `${Math.max(1, Math.round(kb))} КБ` : `${(kb / 1024).toFixed(1).replace(".", ",")} МБ`}`;
}

/** Why a file can't be a guardrail, or null when it can. */
export function fileProblem(fileName: string, size: number): string | null {
  if (!docKind(fileName)) return "Подходят файлы docx, pdf, txt и md";
  if (size > MAX_DOC_BYTES) return "Файл больше 4 МБ";
  if (size === 0) return "Файл пустой";
  return null;
}

/** Whitespace tidied, length capped. */
export function tidyText(text: string): string {
  const t = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > MAX_DOC_TEXT ? t.slice(0, MAX_DOC_TEXT) + "\n…" : t;
}

/** The text of an uploaded file; throws a readable error when there is none. */
export async function extractDocText(fileName: string, data: Uint8Array): Promise<string> {
  const kind = docKind(fileName);
  let text = "";
  try {
    if (kind === "txt" || kind === "md") text = new TextDecoder("utf-8").decode(data);
    else if (kind === "docx") {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer: Buffer.from(data) })).value;
    } else if (kind === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const r = await extractText(pdf, { mergePages: true });
      text = Array.isArray(r.text) ? r.text.join("\n") : r.text;
    }
  } catch {
    throw new Error("Не получилось прочитать файл — он повреждён или защищён паролем");
  }
  const t = tidyText(text);
  if (!t) throw new Error("В файле нет текста — если это скан, сохраните его как текстовый PDF или docx");
  return t;
}

/** What the model is told about the documents of an agent (only enabled ones are passed in). */
export function docsInstructions(docs: { name: string; text: string }[]): string {
  if (!docs.length) return "";
  return "Обязательные правила из документов (нарушать их нельзя, даже если задача просит):\n" +
    docs.map((d) => `--- «${d.name}» ---\n${d.text}`).join("\n\n");
}
