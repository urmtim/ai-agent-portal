// Agent ↔ YAML for import/export (pure, unit-tested in spec.test.ts).
// Models, MCP connections, agents and guardrail documents travel by name; secrets and document texts never appear here.
// Versions 1 and 2 are still read.
import { parse, stringify } from "yaml";
import {
  DEFAULT_GUARD_RULES, DEFAULT_HITL, parseGuardRules, parseHitl, parseRules, rulesToYaml,
  type GuardRule, type HitlChoice, type McpAccess,
} from "./policy";

export type AgentSpec = {
  name: string;
  description: string; // empty → the list shows the instruction's first line
  enabled: boolean;
  model: string | null; // model name; null → the one already chosen in the window
  instruction: string;
  hitl: HitlChoice;
  guardrails: GuardRule[]; // documents by id
  mcp: { name: string; access: McpAccess }[]; // connection names
  agents: string[]; // subagent names
  api: string[]; // portal API keys
};

export const EMPTY_SPEC: AgentSpec = {
  name: "", description: "", enabled: true, model: null, instruction: "", hitl: DEFAULT_HITL, guardrails: [...DEFAULT_GUARD_RULES], mcp: [], agents: [], api: [],
};

/** What exists for this user, by name; documents are {id, name}. */
export type Known = { models: string[]; connections: string[]; agents: string[]; apis: string[]; documents: { id: string; name: string }[] };

/** The YAML text of an agent. */
export function specToYaml(s: AgentSpec, documents: { id: string; name: string }[]): string {
  const doc = {
    version: 3,
    name: s.name,
    description: s.description,
    enabled: s.enabled,
    model: s.model,
    instruction: s.instruction,
    hitl: s.hitl,
    guardrails: rulesToYaml(s.guardrails, (id) => documents.find((d) => d.id === id)?.name),
    mcp: s.mcp.map((m) => ({ name: m.name, access: m.access })),
    agents: s.agents,
    api: s.api,
  };
  return "# AI Portal — агент. Пароли и токены сюда не попадают.\n" + stringify(doc, { lineWidth: 0 });
}

const names = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))] : []);

/** mcp items: "Моя почта" (version 1) or {name, access}. */
function mcpItems(v: unknown): { name: string; access: McpAccess }[] {
  if (!Array.isArray(v)) return [];
  const out: { name: string; access: McpAccess }[] = [];
  for (const x of v) {
    const o = x && typeof x === "object" ? (x as { name?: unknown; access?: unknown }) : null;
    const name = typeof x === "string" ? x.trim() : typeof o?.name === "string" ? o.name.trim() : "";
    const access: McpAccess = o?.access === "send" ? "send" : "read";
    if (name && !out.some((m) => m.name === name)) out.push({ name, access });
  }
  return out;
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

  const mcp = mcpItems(o.mcp).filter((m) => {
    if (known.connections.includes(m.name)) return true;
    warnings.push(`Подключение «${m.name}» не найдено — пропущено`);
    return false;
  });

  const spec: AgentSpec = {
    name: typeof o.name === "string" ? o.name.trim().slice(0, 80) : "",
    description: typeof o.description === "string" ? o.description.trim().slice(0, 300) : "",
    enabled: o.enabled !== false,
    model,
    instruction: typeof o.instruction === "string" ? o.instruction.trim() : "",
    hitl: parseHitl(o.hitl ?? null),
    guardrails,
    mcp,
    agents: keep(names(o.agents), known.agents, (n) => `Агент «${n}» не найден — пропущен`),
    api: keep(names(o.api), known.apis, (n) => `API «${n}» не найдено — пропущено`),
  };
  return { spec, warnings };
}
