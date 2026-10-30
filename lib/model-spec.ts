// Model ↔ YAML for the «YAML» tab of the model window (pure, unit-tested in model-spec.test.ts).
// The token never appears here: it is entered on «Общее» and stays on the server.
import { parse, stringify } from "yaml";

export type ModelSpec = { name: string; baseUrl: string; model: string; contextTokens: number; isDefault: boolean };

export const CONTEXT_MIN = 2000, CONTEXT_MAX = 2000000;

export function modelToYaml(s: ModelSpec): string {
  const doc = { version: 1, name: s.name, baseUrl: s.baseUrl, model: s.model, contextTokens: s.contextTokens, default: s.isDefault };
  return "# AI Portal — модель. Токен сюда не попадает.\n" + stringify(doc, { lineWidth: 0 });
}

/** YAML text → model; a token in the text is ignored with a warning. Returns { error } when it is not a YAML object. */
export function yamlToModel(text: string): { spec: ModelSpec; warnings: string[] } | { error: string } {
  let doc: unknown;
  try { doc = parse(text); } catch (e) { return { error: `Не получилось прочитать YAML: ${(e as Error).message.split("\n")[0]}` }; }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { error: "В YAML нет описания модели" };
  const o = doc as Record<string, unknown>;
  const warnings: string[] = [];
  if (["token", "apiKey", "api_key", "key"].some((k) => k in o)) warnings.push("Токен из YAML не берётся — введите его на вкладке «Общее»");
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
  const n = Math.round(Number(o.contextTokens));
  return {
    spec: {
      name: str(o.name).slice(0, 80),
      baseUrl: str(o.baseUrl),
      model: str(o.model).slice(0, 120),
      contextTokens: Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, CONTEXT_MIN), CONTEXT_MAX) : 32000,
      isDefault: o.default === true,
    },
    warnings,
  };
}
