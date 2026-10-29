// Guardrails of a custom agent (pure, unit-tested in guardrails.test.ts).

export type Guardrails = { maskPii: boolean; maxSteps: number; forbiddenTopics: string[] };

export const DEFAULT_GUARDRAILS: Guardrails = { maskPii: true, maxSteps: 5, forbiddenTopics: [] };

export const MAX_STEPS_LIMIT = 10;

/** Stored JSON (or anything) → valid guardrails, falling back to the defaults field by field. */
export function parseGuardrails(raw: unknown): Guardrails {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw || "{}"); } catch { v = {}; } }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const steps = Math.round(Number(o.maxSteps));
  return {
    maskPii: typeof o.maskPii === "boolean" ? o.maskPii : DEFAULT_GUARDRAILS.maskPii,
    maxSteps: Number.isFinite(steps) && steps >= 1 ? Math.min(steps, MAX_STEPS_LIMIT) : DEFAULT_GUARDRAILS.maxSteps,
    forbiddenTopics: Array.isArray(o.forbiddenTopics)
      ? [...new Set(o.forbiddenTopics.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean))].slice(0, 20)
      : [],
  };
}

// order matters: e-mail and cards before phones, phones (11 digits) before passports (10 digits)
const PII: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[почта]"],
  [/\b(?:\d[ -]?){15,18}\d\b/g, "[карта]"],
  [/(?:\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/g, "[телефон]"],
  [/\b\d{2}\s?\d{2}\s?\d{6}\b/g, "[паспорт]"],
];

/** Personal data in text replaced by labels, before it reaches the model. */
export function maskPii(text: string): string {
  return PII.reduce((t, [re, label]) => t.replace(re, label), text);
}

/** maskPii applied to every string inside a tool result. */
export function maskDeep<T>(value: T): T {
  if (typeof value === "string") return maskPii(value) as T;
  if (Array.isArray(value)) return value.map(maskDeep) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskDeep(v)])) as T;
  }
  return value;
}

/** What the model is told about the guardrails. */
export function guardrailInstructions(g: Guardrails): string {
  return [
    g.forbiddenTopics.length ? `Не обсуждай и не выполняй задачи на темы: ${g.forbiddenTopics.join(", ")}. Если задача касается их — откажись и объясни.` : "",
    g.maskPii ? "Персональные данные в данных заменены метками вроде [телефон] — не пытайся их восстановить." : "",
  ].filter(Boolean).join("\n");
}
