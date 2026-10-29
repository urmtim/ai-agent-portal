// Base assistant settings: what the chat assistant may use. Pure (no DB), unit-tested.
// Rule: nothing is allowed until the user ticks it.

/** Portal APIs the assistant can be given, and the chat tool each one unlocks. None yet («Траты» was removed). */
export const ASSISTANT_APIS: Record<string, { label: string; desc: string; tool: string }> = {};

export type AssistantApi = keyof typeof ASSISTANT_APIS;

export type AssistantConfig = { modelId: string | null; agentIds: string[]; mcpIds: string[]; apis: AssistantApi[] };

export const EMPTY_ASSISTANT: AssistantConfig = { modelId: null, agentIds: [], mcpIds: [], apis: [] };

function ids(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : [];
  } catch {
    return [];
  }
}

/**
 * Stored row → config, keeping only what still exists: the user's agents, known MCP servers, known APIs,
 * and a model from the registry.
 */
export function parseAssistant(
  row: { modelId: string | null; agentIds: string; mcpIds: string; apis: string } | null,
  known: { agentIds: string[]; mcpIds: string[]; modelIds: string[] },
): AssistantConfig {
  if (!row) return { ...EMPTY_ASSISTANT };
  return {
    modelId: row.modelId && known.modelIds.includes(row.modelId) ? row.modelId : null,
    agentIds: ids(row.agentIds).filter((id) => known.agentIds.includes(id)),
    mcpIds: ids(row.mcpIds).filter((id) => known.mcpIds.includes(id)),
    apis: ids(row.apis).filter((k): k is AssistantApi => Object.prototype.hasOwnProperty.call(ASSISTANT_APIS, k)),
  };
}

/** Chat tools the assistant may call with this config (run_agent needs at least one allowed, enabled agent). */
export function allowedTools(cfg: AssistantConfig, enabledAgentIds: string[]): string[] {
  const tools: string[] = cfg.apis.map((a) => ASSISTANT_APIS[a].tool);
  if (cfg.agentIds.some((id) => enabledAgentIds.includes(id))) tools.push("run_agent");
  return tools;
}
