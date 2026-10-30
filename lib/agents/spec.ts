// Agent ↔ YAML for import/export (pure, unit-tested in spec.test.ts).
// Models, connectors, agents and guardrail documents travel by name; secrets and document texts never appear here.
// Versions 1–3 are still read: their «mcp:» items were mailboxes, so they become connectors; «api:» is dropped.
import { parse, stringify } from "yaml";
import {
  DEFAULT_GUARD_RULES, DEFAULT_HITL, parseGuardRules, parseHitl, parseRules, rulesToYaml,
  type GuardRule, type HitlChoice,
} from "./policy";

export type AgentSpec = {
  name: string;
  description: string; // empty → the list shows the instruction's first line
  enabled: boolean;
  model: string | null; // model name; null → the one already chosen in the window
  instruction: string;
  hitl: HitlChoice;
  guardrails: GuardRule[]; // documents by id
  agents: string[]; // subagent names
  connectors: string[]; // connector names (section «Коннекторы»)
};

export const EMPTY_SPEC: AgentSpec = {
  name: "", description: "", enabled: true, model: null, instruction: "", hitl: DEFAULT_HITL, guardrails: [...DEFAULT_GUARD_RULES], agents: [], connectors: [],
};

/** What exists for this user, by name; documents are {id, name}. */
export type Known = { models: string[]; connectors: string[]; agents: string[]; documents: { id: string; name: string }[] };

/** The YAML text of an agent. */
export function specToYaml(s: AgentSpec, documents: { id: string; name: string }[]): string {
  const doc = {
    version: 4,
    name: s.name,
    description: s.description,
    enabled: s.enabled,
    model: s.model,
    instruction: s.instruction,
    hitl: s.hitl,
    guardrails: rulesToYaml(s.guardrails, (id) => documents.find((d) => d.id === id)?.name),
    agents: s.agents,
    connectors: s.connectors,
  };
  return "# AI Portal — агент. Пароли и токены сюда не попадают.\n" + stringify(doc, { lineWidth: 0 });
}

const names = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))] : []);

/** Old «mcp:» items: "Моя почта" (version 1) or {name, access} (versions 2–3) — their names. */
function mcpNames(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const name = typeof x === "string" ? x : x && typeof x === "object" ? (x as { name?: unknown }).name : null;
    return typeof name === "string" && name.trim() ? [name.trim()] : [];
  });
}

/**
 * YAML text → agent, keeping only names that exist for this user (the rest become warnings).
 * Returns { error } when the text is not a YAML object.
 */
export function yamlToSpec(text: string, known: Known): { spec: AgentSpec; warnings: string[] } | { error: string } {
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

  let model = typeof o.model === "string" && o.model.trim() ? o.model.trim() : null;
  if (model && !known.models.includes(model)) { warnings.push(`Модель «${model}» не найдена — остаётся выбранная в окне`); model = null; }
  if (o.type === "receipts") warnings.push("Встроенного типа «Чеки из почты» больше нет — агент будет «Своим», задайте ему инструкцию");

  // guardrails: a list now ({document: name} by name), {enabled, rules} in version 2, an object in version 1
  const g = o.guardrails;
  let guardrails: GuardRule[];
  if (g === undefined) guardrails = [...DEFAULT_GUARD_RULES];
  else {
    const items = Array.isArray(g) ? g : g && typeof g === "object" && Array.isArray((g as { rules?: unknown }).rules) ? (g as { rules: unknown[] }).rules : null;
    if (!items) guardrails = parseGuardRules(g);
    else {
      const withIds = items.flatMap((x) => {
        const name = x && typeof x === "object" ? (x as { document?: unknown }).document : undefined;
        if (typeof name !== "string") return [x];
        const d = known.documents.find((k) => k.name === name.trim());
        if (!d) { warnings.push(`Документ «${name.trim()}» не найден — пропущен`); return []; }
        return [{ kind: "document", id: d.id }];
      });
      guardrails = parseRules(withIds);
    }
  }

  const spec: AgentSpec = {
    name: typeof o.name === "string" ? o.name.trim().slice(0, 80) : "",
    description: typeof o.description === "string" ? o.description.trim().slice(0, 300) : "",
    enabled: o.enabled !== false,
    model,
    instruction: typeof o.instruction === "string" ? o.instruction.trim() : "",
    hitl: parseHitl(o.hitl ?? null),
    guardrails,
    agents: keep(names(o.agents), known.agents, (n) => `Агент «${n}» не найден — пропущен`),
    connectors: keep(names([...names(o.connectors), ...mcpNames(o.mcp)]), known.connectors, (n) => `Коннектор «${n}» не найден — пропущен`),
  };
  return { spec, warnings };
}
