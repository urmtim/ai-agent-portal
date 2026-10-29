// Agent row → what the agent window edits (pure; used by the agents list and the agent page).

const ids = (raw: string): string[] => {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
};

export function agentEditData(a: { id: string; name: string; enabled: boolean; modelId: string | null; config: string; agentIds: string; mcpIds: string; apis: string }) {
  let cfg: { sinceDays?: number; max?: number; fromFilter?: string } = {};
  try { cfg = JSON.parse(a.config || "{}"); } catch { /* defaults below */ }
  return {
    id: a.id, name: a.name, enabled: a.enabled, modelId: a.modelId,
    sinceDays: cfg.sinceDays ?? 30, max: cfg.max ?? 40, fromFilter: cfg.fromFilter ?? "",
    agentIds: ids(a.agentIds), mcpIds: ids(a.mcpIds), apis: ids(a.apis),
  };
}
