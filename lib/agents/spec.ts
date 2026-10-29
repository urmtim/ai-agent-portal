// Agent ↔ YAML for import/export (pure, unit-tested in spec.test.ts).
// Models, MCP connections and agents travel by name; secrets never appear here. The version-1 format is still read.
import { parse, stringify } from "yaml";
import {
  DEFAULT_GUARD_POLICY, DEFAULT_HITL, parseGuardPolicy, parseHitl, parseRules, rulesToYaml,
  type GuardPolicy, type HitlPolicy, type McpAccess,
} from "./policy";

export type AgentSpec = {
  name: string;
  enabled: boolean;
  model: string | null; // model name; null → the owner's default
  instruction: string;
  hitl: HitlPolicy;
  guardrails: GuardPolicy;
  mcp: { name: string; access: McpAccess }[]; // connection names
  agents: string[]; // subagent names
  api: string[]; // portal API keys
};

export const EMPTY_SPEC: AgentSpec = {
  name: "", enabled: true, model: null, instruction: "",
  hitl: { ...DEFAULT_HITL }, guardrails: { enabled: DEFAULT_GUARD_POLICY.enabled, rules: [...DEFAULT_GUARD_POLICY.rules] },
  mcp: [], agents: [], api: [],
};

/** The YAML text of an agent. */
export function specToYaml(s: AgentSpec): string {
  const doc = {
    version: 2,
    name: s.name,
    enabled: s.enabled,
    model: s.model,
    instruction: s.instruction,
    hitl: { enabled: s.hitl.enabled, ask: s.hitl.ask },
    guardrails: { enabled: s.guardrails.enabled, rules: rulesToYaml(s.guardrails.rules) },
    mcp: s.mcp.map((m) => ({ name: m.name, access: m.access })),
    agents: s.agents,
    api: s.api,
  };
  return "# AI Portal — агент. Пароли и токены сюда не попадают.\n" +
    stringify(doc, { lineWidth: 0 });
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

  let model = typeof o.model === "string" && o.model.trim() ? o.model.trim() : null;
  if (model && !known.models.includes(model)) { warnings.push(`Модель «${model}» не найдена — будет модель по умолчанию`); model = null; }
  if (o.type === "receipts") warnings.push("Встроенного типа «Чеки из почты» больше нет — агент будет «Своим», задайте ему инструкцию");

  // guardrails: {enabled, rules: [...]} now, {maskPii, maxSteps, forbiddenTopics} in version 1
  const g = o.guardrails as { enabled?: unknown; rules?: unknown } | undefined;
  const guardrails: GuardPolicy = g && typeof g === "object" && Array.isArray(g.rules)
    ? { enabled: g.enabled !== false, rules: parseRules(g.rules) }
    : g === undefined ? { enabled: DEFAULT_GUARD_POLICY.enabled, rules: [...DEFAULT_GUARD_POLICY.rules] } : parseGuardPolicy(g);

  const mcp = mcpItems(o.mcp).filter((m) => {
    if (known.connections.includes(m.name)) return true;
    warnings.push(`Подключение «${m.name}» не найдено — пропущено`);
    return false;
  });

  const spec: AgentSpec = {
    name: typeof o.name === "string" ? o.name.trim().slice(0, 80) : "",
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
