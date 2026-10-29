// Agent policies — «Подтверждение действий (HITL)», guardrails, MCP access (pure, unit-tested in policy.test.ts).
// Stored as JSON in Agent/Assistant .hitl / .guardrails / .mcpAccess; older values are still read.
import { DEFAULT_GUARDRAILS, MAX_STEPS_LIMIT, parseGuardrails, type Guardrails } from "./guardrails";

// ---- HITL ----

/** When the human is asked: before changes and sends, only before sends, or never. */
export type HitlChoice = "changes_and_send" | "send_only" | "off";

export const DEFAULT_HITL: HitlChoice = "changes_and_send";

export const HITL_LABELS: Record<HitlChoice, string> = {
  changes_and_send: "Спрашивать перед изменением и отправкой",
  send_only: "Спрашивать только перед отправкой",
  off: "Не спрашивать",
};

const json = (raw: unknown): unknown => {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw || "null"); } catch { return raw; }
};

const isChoice = (v: unknown): v is HitlChoice => v === "changes_and_send" || v === "send_only" || v === "off";

/** Stored or YAML HITL → choice. Read: "off" | …, {enabled, ask}, "none" (→ off), "confirm" (→ default). */
export function parseHitl(raw: unknown): HitlChoice {
  const v = json(raw);
  if (isChoice(v)) return v;
  if (v === "none") return "off";
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.enabled === false) return "off";
    return o.ask === "send_only" ? "send_only" : DEFAULT_HITL;
  }
  return DEFAULT_HITL;
}

/** Does the human get asked at all? Until per-action approvals exist, «asked» means: confirm the launch. */
export const hitlAsks = (raw: unknown): boolean => parseHitl(raw) !== "off";

// ---- Guardrails ----

/** Built-in rules work in code; a document's text goes to the model as binding rules. */
export type GuardRule =
  | { kind: "maskPii" }
  | { kind: "maxSteps"; value: number }
  | { kind: "forbiddenTopic"; value: string }
  | { kind: "document"; id: string };

export const DEFAULT_GUARD_RULES: GuardRule[] = [{ kind: "maskPii" }, { kind: "maxSteps", value: DEFAULT_GUARDRAILS.maxSteps }];

/** Built-in kinds, for the table and the «Добавить» list. */
export const BUILTIN_GUARDS = {
  maskPii: { label: "Маскирование ПДн", desc: "Почта, телефоны, карты и паспорта заменяются метками до отправки модели" },
  maxSteps: { label: "Лимит шагов", desc: "Сколько раз за запуск агент обращается к модели и инструментам" },
  forbiddenTopic: { label: "Запрещённая тема", desc: "Агент отказывается обсуждать и выполнять задачи на эту тему" },
} as const;

export const isBuiltin = (r: GuardRule): r is Exclude<GuardRule, { kind: "document" }> => r.kind !== "document";

/** Row name; documents are named by the catalog (`docName`), a missing one is «Документ удалён». */
export function ruleLabel(r: GuardRule, docName?: (id: string) => string | undefined): string {
  if (r.kind === "document") return docName?.(r.id) ?? "Документ удалён";
  return r.kind === "maskPii" ? BUILTIN_GUARDS.maskPii.label : `${BUILTIN_GUARDS[r.kind].label} — ${r.value}`;
}

/** A stable key for one rule (topics are told apart by their text, documents by id). */
export const ruleKey = (r: GuardRule): string =>
  r.kind === "forbiddenTopic" ? `topic:${r.value.toLowerCase()}` : r.kind === "document" ? `doc:${r.id}` : r.kind;

const steps = (v: unknown): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_STEPS_LIMIT) : null;
};

/** One stored rule: {kind, value | id}, or the YAML forms "maskPii", {maxSteps: 5}, {forbiddenTopic: "…"}. */
function parseRule(v: unknown): GuardRule | null {
  if (v === "maskPii") return { kind: "maskPii" };
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const kind = typeof o.kind === "string" ? o.kind : Object.keys(o)[0];
  const value = typeof o.kind === "string" ? (o.kind === "document" ? o.id : o.value) : o[kind];
  if (kind === "maskPii") return { kind: "maskPii" };
  if (kind === "maxSteps") { const n = steps(value); return n ? { kind: "maxSteps", value: n } : null; }
  if (kind === "forbiddenTopic" && typeof value === "string" && value.trim()) return { kind: "forbiddenTopic", value: value.trim().slice(0, 80) };
  if (kind === "document" && typeof value === "string" && value) return { kind: "document", id: value };
  return null;
}

/** Rules without duplicates (one mask, one step limit, each topic and document once), at most 30. */
export function cleanRules(rules: GuardRule[]): GuardRule[] {
  const seen = new Set<string>();
  return rules.filter((r) => { const k = ruleKey(r); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 30);
}

/** Items (stored or YAML) → rules. */
export const parseRules = (items: unknown): GuardRule[] =>
  cleanRules((Array.isArray(items) ? items : []).map(parseRule).filter((r): r is GuardRule => !!r));

/**
 * Stored guardrails → rules. Read: {rules: [...]} (the old «enabled» switch is gone), a plain list,
 * and the first shape {maskPii, maxSteps, forbiddenTopics}.
 */
export function parseGuardRules(raw: unknown): GuardRule[] {
  const v = json(raw);
  if (Array.isArray(v)) return parseRules(v);
  if (v && typeof v === "object" && Array.isArray((v as { rules?: unknown }).rules)) return parseRules((v as { rules: unknown[] }).rules);
  const old = parseGuardrails(v ?? {});
  return cleanRules([
    ...(old.maskPii ? [{ kind: "maskPii" } as const] : []),
    { kind: "maxSteps", value: old.maxSteps },
    ...old.forbiddenTopics.map((t) => ({ kind: "forbiddenTopic", value: t }) as const),
  ]);
}

/** Rules from a form: documents only among the user's own (`ownDocIds`). */
export const ownGuardRules = (raw: unknown, ownDocIds: string[]): GuardRule[] =>
  parseGuardRules(raw).filter((r) => r.kind !== "document" || ownDocIds.includes(r.id));

/** What the runtime applies from the built-in rules (documents are loaded by id, see guardDocIds). */
export function effectiveGuardrails(rules: GuardRule[]): Guardrails {
  const limit = rules.find((r) => r.kind === "maxSteps");
  return {
    maskPii: rules.some((r) => r.kind === "maskPii"),
    maxSteps: limit?.kind === "maxSteps" ? limit.value : DEFAULT_GUARDRAILS.maxSteps,
    forbiddenTopics: rules.flatMap((r) => (r.kind === "forbiddenTopic" ? [r.value] : [])),
  };
}

/** Stored guardrails → what the runtime applies. */
export const agentGuardrails = (raw: unknown): Guardrails => effectiveGuardrails(parseGuardRules(raw));

/** Ids of the documents among the rules. */
export const guardDocIds = (rules: GuardRule[]): string[] => rules.flatMap((r) => (r.kind === "document" ? [r.id] : []));

/** Rules as YAML items; documents travel by name (`docName`), unknown ones are dropped. */
export function rulesToYaml(rules: GuardRule[], docName: (id: string) => string | undefined): unknown[] {
  return rules.flatMap((r): unknown[] => {
    if (r.kind === "maskPii") return ["maskPii"];
    if (r.kind === "document") { const n = docName(r.id); return n ? [{ document: n }] : []; }
    return [{ [r.kind]: r.value }];
  });
}

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
