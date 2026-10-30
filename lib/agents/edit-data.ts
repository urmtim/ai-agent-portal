// Agent row → what the agent window edits (pure; used by the agents list and the agent page).
import { parseGuardRules, parseHitl } from "./policy";

const ids = (raw: string): string[] => {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
};

export function agentEditData(a: {
  id: string; name: string; description: string; enabled: boolean; modelId: string | null;
  agentIds: string; connectorIds: string; instruction: string; hitl: string; guardrails: string;
}) {
  return {
    id: a.id, name: a.name, description: a.description, enabled: a.enabled, modelId: a.modelId, instruction: a.instruction,
    hitl: parseHitl(a.hitl), guardrails: parseGuardRules(a.guardrails),
    agentIds: ids(a.agentIds), connectorIds: ids(a.connectorIds),
  };
}
