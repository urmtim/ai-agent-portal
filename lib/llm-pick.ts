// Which LLM a call uses: the agent's own model → the default model → the .env model. Pure, see llm.test.ts.

export type RegistryModel = { id: string; name: string; baseUrl: string; model: string; tokenEnc: string | null; isDefault: boolean; contextTokens: number };

export type ModelChoice =
  | ({ source: "registry" } & RegistryModel)
  | { source: "env"; name: string; baseUrl: string; model: string; token?: string; contextTokens: number };

/** Context size when nothing says otherwise. */
export const DEFAULT_CONTEXT_TOKENS = 32000;

/** rows are in creation order; if none is marked default, the earliest one is. */
export function pickModel(rows: RegistryModel[], agentModelId: string | null, env: ModelChoice | null): ModelChoice | null {
  const own = agentModelId ? rows.find((r) => r.id === agentModelId) : undefined;
  const chosen = own ?? rows.find((r) => r.isDefault) ?? rows[0];
  if (chosen) {
    const { id, name, baseUrl, model, tokenEnc, isDefault, contextTokens } = chosen;
    return { source: "registry", id, name, baseUrl, model, tokenEnc, isDefault, contextTokens };
  }
  return env;
}
