// Base assistant settings: what the chat assistant may use. Pure (no DB), unit-tested.
// Rule: nothing is allowed until the user ticks it.
import { DEFAULT_GUARD_RULES, DEFAULT_HITL, parseGuardRules, parseHitl, type GuardRule, type HitlChoice } from "./agents/policy";

export type AssistantConfig = {
  modelId: string | null; agentIds: string[];
  /** Connectors (section «Коннекторы») it may use. MCP servers come later. */
  connectorIds: string[];
  /** Added to the built-in chat instructions. */
  instruction: string;
  hitl: HitlChoice;
  guardrails: GuardRule[];
};

export const EMPTY_ASSISTANT: AssistantConfig = {
  modelId: null, agentIds: [], connectorIds: [], instruction: "", hitl: DEFAULT_HITL, guardrails: [...DEFAULT_GUARD_RULES],
};

function ids(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : [];
  } catch {
    return [];
  }
}

/** Stored row → config, keeping only what still exists: the user's agents and connectors, and a model from the registry. */
export function parseAssistant(
  row: { modelId: string | null; agentIds: string; connectorIds?: string; instruction?: string; hitl?: string; guardrails?: string } | null,
  known: { agentIds: string[]; connectorIds: string[]; modelIds: string[] },
): AssistantConfig {
  if (!row) return { ...EMPTY_ASSISTANT, guardrails: [...DEFAULT_GUARD_RULES] };
  return {
    modelId: row.modelId && known.modelIds.includes(row.modelId) ? row.modelId : null,
    agentIds: ids(row.agentIds).filter((id) => known.agentIds.includes(id)),
    connectorIds: ids(row.connectorIds).filter((id) => known.connectorIds.includes(id)),
    instruction: row.instruction ?? "",
    hitl: parseHitl(row.hitl ?? null),
    guardrails: parseGuardRules(row.guardrails ?? "{}"),
  };
}

/** Chat tools the assistant may call with this config (run_agent needs at least one allowed, enabled agent;
 *  the mail tools — an allowed, switched-on «Почта» connector). */
export function allowedTools(cfg: Pick<AssistantConfig, "agentIds" | "connectorIds">, enabledAgentIds: string[], mailConnectorIds: string[] = []): string[] {
  const tools: string[] = [];
  if (cfg.agentIds.some((id) => enabledAgentIds.includes(id))) tools.push("run_agent");
  if (cfg.connectorIds.some((id) => mailConnectorIds.includes(id))) tools.push("mail_search", "mail_read", "mail_count");
  return tools;
}
