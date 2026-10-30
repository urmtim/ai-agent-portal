// Which LLM a call uses: the agent's own model; the .env model only while the owner has no models at all.
// Nothing silently falls back to another model. Pure, see llm.test.ts.

export type RegistryModel = { id: string; name: string; baseUrl: string; model: string; tokenEnc: string | null; contextTokens: number };

export type ModelChoice =
  | ({ source: "registry" } & RegistryModel)
  | { source: "env"; name: string; baseUrl: string; model: string; token?: string; contextTokens: number };

/** Context size when nothing says otherwise. */
export const DEFAULT_CONTEXT_TOKENS = 32000;

/** Why there is no model: none at all, or the owner has models but this agent has none chosen. */
export type NoModel = { none: "nothing" | "not-chosen" };

export function pickModel(rows: RegistryModel[], agentModelId: string | null, env: ModelChoice | null): ModelChoice | NoModel {
  if (rows.length === 0) return env ?? { none: "nothing" };
  const own = agentModelId ? rows.find((r) => r.id === agentModelId) : undefined;
  if (!own) return { none: "not-chosen" };
  const { id, name, baseUrl, model, tokenEnc, contextTokens } = own;
  return { source: "registry", id, name, baseUrl, model, tokenEnc, contextTokens };
}

export const NOTHING_MESSAGE = "LLM не настроена: добавьте модель в разделе «Модели»";
export const NOT_CHOSEN_MESSAGE = "Модель не выбрана: выберите её в окне агента";

export function noModelMessage(n: NoModel): string {
  return n.none === "nothing" ? NOTHING_MESSAGE : NOT_CHOSEN_MESSAGE;
}
