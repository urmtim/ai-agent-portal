// Agent policies — «Человек в контуре (HITL)», guardrail rules, MCP access (pure, unit-tested in policy.test.ts).
// Stored as JSON in Agent.hitl / Agent.guardrails / Agent.mcpAccess; older values are still read.
import { DEFAULT_GUARDRAILS, MAX_STEPS_LIMIT, parseGuardrails, type Guardrails } from "./guardrails";

// ---- HITL ----

/** When the human is asked: before changes and sends, or only before sends. */
export type HitlAsk = "changes_and_send" | "send_only";
export type HitlPolicy = { enabled: boolean; ask: HitlAsk };

export const DEFAULT_HITL: HitlPolicy = { enabled: true, ask: "changes_and_send" };

export const HITL_ASK_LABELS: Record<HitlAsk, string> = {
  changes_and_send: "Спрашивать перед изменением и отправкой",
  send_only: "Спрашивать только перед отправкой",
};

const json = (raw: unknown): unknown => {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw || "null"); } catch { return raw; }
};

/** Stored HITL → policy. Old values: "none" → off, "confirm" → on. */
export function parseHitl(raw: unknown): HitlPolicy {
  const v = json(raw);
  if (v === "none") return { ...DEFAULT_HITL, enabled: false };
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return { enabled: o.enabled !== false, ask: o.ask === "send_only" ? "send_only" : "changes_and_send" };
  }
  return { ...DEFAULT_HITL };
}

// ---- Guardrails ----

export type GuardRule =
  | { kind: "maskPii" }
  | { kind: "maxSteps"; value: number }
  | { kind: "forbiddenTopic"; value: string };
export type GuardPolicy = { enabled: boolean; rules: GuardRule[] };

export const DEFAULT_GUARD_POLICY: GuardPolicy = { enabled: true, rules: [{ kind: "maskPii" }, { kind: "maxSteps", value: DEFAULT_GUARDRAILS.maxSteps }] };

/** What each kind is, for the table and the «Добавить» list. */
export const GUARD_KINDS = {
  maskPii: { label: "Маскирование ПДн", desc: "Почта, телефоны, карты и паспорта заменяются метками до отправки модели", once: true },
  maxSteps: { label: "Лимит шагов", desc: "Сколько раз за запуск агент обращается к модели и инструментам", once: true },
  forbiddenTopic: { label: "Запрещённая тема", desc: "Агент отказывается обсуждать и выполнять задачи на эту тему", once: false },
} as const;

export function ruleLabel(r: GuardRule): string {
  return r.kind === "maskPii" ? GUARD_KINDS.maskPii.label : `${GUARD_KINDS[r.kind].label} — ${r.value}`;
}

/** A stable key for one rule (topics are told apart by their text). */
export const ruleKey = (r: GuardRule): string => (r.kind === "forbiddenTopic" ? `topic:${r.value.toLowerCase()}` : r.kind);

const steps = (v: unknown): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_STEPS_LIMIT) : null;
};

/** One rule from stored JSON or YAML: {kind, value}, "maskPii", {maxSteps: 5}, {forbiddenTopic: "…"}. */
function parseRule(v: unknown): GuardRule | null {
  if (v === "maskPii") return { kind: "maskPii" };
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const kind = typeof o.kind === "string" ? o.kind : Object.keys(o)[0];
  const value = typeof o.kind === "string" ? o.value : o[kind];
  if (kind === "maskPii") return { kind: "maskPii" };
  if (kind === "maxSteps") { const n = steps(value); return n ? { kind: "maxSteps", value: n } : null; }
  if (kind === "forbiddenTopic" && typeof value === "string" && value.trim()) return { kind: "forbiddenTopic", value: value.trim().slice(0, 80) };
  return null;
}

/** Rules without duplicates (one mask, one step limit, each topic once), at most 30. */
export function cleanRules(rules: GuardRule[]): GuardRule[] {
  const seen = new Set<string>();
  return rules.filter((r) => { const k = ruleKey(r); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 30);
}

/** Stored guardrails → policy. The old shape {maskPii, maxSteps, forbiddenTopics} becomes rules. */
export function parseGuardPolicy(raw: unknown): GuardPolicy {
  const v = json(raw);
  if (v && typeof v === "object" && Array.isArray((v as { rules?: unknown }).rules)) {
    const o = v as { enabled?: unknown; rules: unknown[] };
    return { enabled: o.enabled !== false, rules: cleanRules(o.rules.map(parseRule).filter((r): r is GuardRule => !!r)) };
  }
  const old = parseGuardrails(v ?? {});
  return {
    enabled: true,
    rules: cleanRules([
      ...(old.maskPii ? [{ kind: "maskPii" } as const] : []),
      { kind: "maxSteps", value: old.maxSteps },
      ...old.forbiddenTopics.map((t) => ({ kind: "forbiddenTopic", value: t }) as const),
    ]),
  };
}

/** What the runtime applies: guardrails switched off → no masking, no topics, the default step limit. */
export function effectiveGuardrails(p: GuardPolicy): Guardrails {
  if (!p.enabled) return { maskPii: false, maxSteps: DEFAULT_GUARDRAILS.maxSteps, forbiddenTopics: [] };
  const limit = p.rules.find((r) => r.kind === "maxSteps");
  return {
    maskPii: p.rules.some((r) => r.kind === "maskPii"),
    maxSteps: limit?.kind === "maxSteps" ? limit.value : DEFAULT_GUARDRAILS.maxSteps,
    forbiddenTopics: p.rules.flatMap((r) => (r.kind === "forbiddenTopic" ? [r.value] : [])),
  };
}

/** Stored Agent.guardrails → what the runtime applies. */
export const agentGuardrails = (raw: unknown): Guardrails => effectiveGuardrails(parseGuardPolicy(raw));

/** Rules as YAML items: "maskPii", {maxSteps: 5}, {forbiddenTopic: "…"}. */
export function rulesToYaml(rules: GuardRule[]): unknown[] {
  return rules.map((r) => (r.kind === "maskPii" ? "maskPii" : { [r.kind]: r.value }));
}

/** YAML / form items → rules. */
export const parseRules = (items: unknown): GuardRule[] =>
  cleanRules((Array.isArray(items) ? items : []).map(parseRule).filter((r): r is GuardRule => !!r));

// ---- MCP access ----

/** What the agent may do with one connection. */
export type McpAccess = "read" | "send";

export const MCP_ACCESS_LABELS: Record<McpAccess, string> = { read: "только чтение", send: "чтение и отправка" };

/** Stored {connectionId: access} → map; anything unknown is «read». */
export function parseMcpAccess(raw: unknown): Record<string, McpAccess> {
  const v = json(raw);
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, a]) => [k, a === "send" ? "send" : "read"]));
}
