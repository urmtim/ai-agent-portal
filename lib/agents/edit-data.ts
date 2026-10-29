// Agent row → what the agent window edits (pure; used by the agents list and the agent page).
import { parseGuardrails } from "./guardrails";

const ids = (raw: string): string[] => {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
};

export function agentEditData(a: {
  id: string; type: "CUSTOM" | "RECEIPTS"; name: string; enabled: boolean; modelId: string | null; config: string;
  agentIds: string; mcpIds: string; apis: string; instruction: string; hitl: string; guardrails: string;
}) {
  let cfg: { sinceDays?: number; max?: number; fromFilter?: string } = {};
  try { cfg = JSON.parse(a.config || "{}"); } catch { /* defaults below */ }
  return {
    id: a.id, type: a.type, name: a.name, enabled: a.enabled, modelId: a.modelId,
    instruction: a.instruction, hitl: (a.hitl === "none" ? "none" : "confirm") as "confirm" | "none", guardrails: parseGuardrails(a.guardrails),
    sinceDays: cfg.sinceDays ?? 30, max: cfg.max ?? 40, fromFilter: cfg.fromFilter ?? "",
    agentIds: ids(a.agentIds), mcpIds: ids(a.mcpIds), apis: ids(a.apis),
  };
}
