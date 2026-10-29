// Agent ↔ YAML for import/export (pure, unit-tested in spec.test.ts).
// Models, MCP connections and agents travel by name; secrets never appear here.
import { parse, stringify } from "yaml";
import { DEFAULT_GUARDRAILS, parseGuardrails, type Guardrails } from "./guardrails";

export type AgentKind = "custom" | "receipts";
export type Hitl = "confirm" | "none";

export type AgentSpec = {
  name: string;
  type: AgentKind;
  enabled: boolean;
  model: string | null; // model name; null → the owner's default
  instruction: string;
  hitl: Hitl;
  guardrails: Guardrails;
  mcp: string[]; // connection names
  agents: string[]; // agent names
  api: string[]; // portal API keys
  receipts: { sinceDays: number; max: number; fromFilter: string };
};

export const EMPTY_SPEC: AgentSpec = {
  name: "", type: "custom", enabled: true, model: null, instruction: "", hitl: "confirm",
  guardrails: { ...DEFAULT_GUARDRAILS }, mcp: [], agents: [], api: [],
  receipts: { sinceDays: 30, max: 40, fromFilter: "" },
};

/** The YAML text of an agent (custom agents omit receipts settings, receipts agents omit instruction and guardrails). */
export function specToYaml(s: AgentSpec): string {
  const doc: Record<string, unknown> = { version: 1, name: s.name, type: s.type, enabled: s.enabled, model: s.model };
  if (s.type === "custom") {
    doc.instruction = s.instruction;
    doc.guardrails = s.guardrails;
  } else {
    doc.receipts = s.receipts;
  }
  doc.hitl = s.hitl;
  doc.mcp = s.mcp;
  doc.agents = s.agents;
  doc.api = s.api;
  return "# AI Portal — агент. Модель, подключения и агенты — по названию; пароли и токены сюда не попадают.\n" +
    stringify(doc, { lineWidth: 0 });
}

const names = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))] : []);
const int = (v: unknown, min: number, max: number, def: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min ? Math.min(n, max) : def; };

/**
 * YAML text → agent, keeping only names that exist for this user (the rest become warnings).
 * Returns { error } when the text is not a YAML object.
 */
export function yamlToSpec(text: string, known: { models: string[]; connections: string[]; agents: string[]; apis: string[] }):
  { spec: AgentSpec; warnings: string[] } | { error: string } {
  let doc: unknown;
  try { doc = parse(text); } catch (e) { return { error: `Не получилось прочитать YAML: ${(e as Error).message.split("\n")[0]}` }; }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { error: "В YAML нет описания агента" };
  const o = doc as Record<string, unknown>;
  const warnings: string[] = [];
  const keep = (list: string[], have: string[], missing: (n: string) => string) => list.filter((n) => {
    if (have.includes(n)) return true;
    warnings.push(missing(n));
    return false;
  });

  const type: AgentKind = o.type === "receipts" ? "receipts" : "custom";
  let model = typeof o.model === "string" && o.model.trim() ? o.model.trim() : null;
  if (model && !known.models.includes(model)) { warnings.push(`Модель «${model}» не найдена — будет модель по умолчанию`); model = null; }
  const r = (o.receipts && typeof o.receipts === "object" ? o.receipts : {}) as Record<string, unknown>;

  const spec: AgentSpec = {
    name: typeof o.name === "string" ? o.name.trim().slice(0, 80) : "",
    type,
    enabled: o.enabled !== false,
    model,
    instruction: typeof o.instruction === "string" ? o.instruction.trim() : "",
    hitl: o.hitl === "none" ? "none" : "confirm",
    guardrails: parseGuardrails(o.guardrails ?? {}),
    mcp: keep(names(o.mcp), known.connections, (n) => `Подключение «${n}» не найдено — пропущено`),
    agents: keep(names(o.agents), known.agents, (n) => `Агент «${n}» не найден — пропущен`),
    api: keep(names(o.api), known.apis, (n) => `API «${n}» не найдено — пропущено`),
    receipts: { sinceDays: int(r.sinceDays, 1, 365, 30), max: int(r.max, 1, 200, 40), fromFilter: typeof r.fromFilter === "string" ? r.fromFilter.trim() : "" },
  };
  return { spec, warnings };
}
