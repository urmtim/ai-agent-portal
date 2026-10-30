// What of a long chat the model gets (pure, unit-tested in context.test.ts):
// old tool results in short form, and the start of the chat retold once the history nears the model's context.

/** The bits of an AI SDK UIMessage these functions look at. */
export type Msg = { id: string; role: string; parts: unknown[] };
type ToolPart = { type: string; state?: string; output?: unknown };

/** Summarize when the history passes this share of the context… */
export const SUMMARY_AT = 0.7;
/** …and keep this share of it as real messages after the cut. */
export const KEEP_SHARE = 0.4;
/** Says it is the history that is short, not the letter: otherwise the model tells the user the tool cuts it. */
const CUT_NOTE = "… [в истории чата сокращено; целиком — прочитай снова тем же инструментом]";

/** Rough token count: ~3 characters of JSON per token (Russian text and JSON alike, erring on the high side). */
export function estimateTokens(v: unknown): number {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? "");
  return Math.ceil(s.length / 3);
}

const isTool = (p: unknown): p is ToolPart => !!p && typeof p === "object" && typeof (p as ToolPart).type === "string" && (p as ToolPart).type.startsWith("tool-");

/** A tool result as an old message carries it: letters without their text, a letter cut short, an agent run without its log. */
export function compactOutput(toolName: string, output: unknown): unknown {
  if (!output || typeof output !== "object" || "error" in output) return output;
  const o = output as Record<string, unknown>;
  if (toolName === "mail_search" && Array.isArray(o.letters)) {
    return { ...o, letters: (o.letters as Record<string, unknown>[]).map(({ id, date, from, subject }) => ({ id, date, from, subject })) };
  }
  if (toolName === "mail_read" && o.letter && typeof o.letter === "object") {
    const l = o.letter as Record<string, unknown>;
    const text = typeof l.text === "string" && l.text.length > 300 ? l.text.slice(0, 300) + CUT_NOTE : l.text;
    return { ...o, letter: { ...l, text } };
  }
  if (toolName === "mail_attachment" && typeof o.text === "string" && o.text.length > 300) return { ...o, text: o.text.slice(0, 300) + CUT_NOTE };
  if (toolName === "get_policies") return { note: "Политики выдавались раньше; действуют те, что выданы перед текущим вопросом." };
  if (toolName === "run_agent" && "log" in o) {
    const { log: _log, ...rest } = o; // eslint-disable-line @typescript-eslint/no-unused-vars
    return rest;
  }
  return output;
}

/** Copies of the messages where tool results before `keepFrom` (the current question) are compacted. */
export function trimToolResults<M extends Msg>(messages: M[], keepFrom: number): M[] {
  return messages.map((m, i) => {
    if (i >= keepFrom || !m.parts.some(isTool)) return m;
    return {
      ...m,
      parts: m.parts.map((p) => (isTool(p) && p.state === "output-available" ? { ...p, output: compactOutput(p.type.slice(5), p.output) } : p)),
    };
  });
}

/** Index of the last user message (the current question), or 0. */
export function lastUserIndex(messages: Msg[]): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return i;
  return 0;
}

/**
 * Where the retold start should end: messages before the returned index go into the summary.
 * Returns `summaryUpto` when the history still fits (or nothing more can be cut).
 * The cut lands on a user message, never past the current question, as early as leaves the rest within KEEP_SHARE.
 */
export function planSummary({ messages, summaryUpto, budget, fixedTokens }: { messages: Msg[]; summaryUpto: number; budget: number; fixedTokens: number }): number {
  const tail = (from: number) => estimateTokens(messages.slice(from));
  if (fixedTokens + tail(summaryUpto) <= SUMMARY_AT * budget) return summaryUpto;
  const last = lastUserIndex(messages);
  for (let i = summaryUpto + 1; i < last; i++) {
    if (messages[i].role === "user" && fixedTokens + tail(i) <= KEEP_SHARE * budget) return i;
  }
  return Math.max(summaryUpto, last);
}

/** Messages as plain text for the summarizer: «Пользователь: …», «Ассистент: …», tool results as short JSON. */
export function summaryInput(messages: Msg[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const who = m.role === "user" ? "Пользователь" : "Ассистент";
    for (const p of m.parts) {
      const part = p as { type?: string; text?: string; input?: unknown; output?: unknown };
      if (part.type === "text" && part.text?.trim()) lines.push(`${who}: ${part.text.trim()}`);
      else if (isTool(p) && part.output !== undefined) {
        const name = p.type.slice(5);
        const json = JSON.stringify(compactOutput(name, part.output));
        lines.push(`[${name}] ${json.length > 300 ? json.slice(0, 300) + "…" : json}`);
      }
    }
  }
  return lines.join("\n");
}
