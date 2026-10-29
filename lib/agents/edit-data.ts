// Agent row → what the agent window edits (pure; used by the agents list and the agent page).
import { parseGuardPolicy, parseHitl, parseMcpAccess } from "./policy";

const ids = (raw: string): string[] => {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
};

export function agentEditData(a: {
  id: string; name: string; enabled: boolean; modelId: string | null;
  agentIds: string; mcpIds: string; mcpAccess: string; apis: string; instruction: string; hitl: string; guardrails: string;
}) {
  return {
    id: a.id, name: a.name, enabled: a.enabled, modelId: a.modelId, instruction: a.instruction,
    hitl: parseHitl(a.hitl), guardrails: parseGuardPolicy(a.guardrails),
    agentIds: ids(a.agentIds), mcpIds: ids(a.mcpIds), mcpAccess: parseMcpAccess(a.mcpAccess), apis: ids(a.apis),
  };
}
