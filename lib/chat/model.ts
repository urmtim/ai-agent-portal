import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { endpointFor, resolveModel } from "@/lib/llm";

export const NO_MODEL_MESSAGE = "LLM не настроена: добавьте модель в разделе «Модели»";

/**
 * The chat's model as an AI SDK language model (any OpenAI-compatible endpoint).
 * Same choice as the rest of the portal: chat's own → default → .env. Null when none.
 */
export async function chatModel(modelId?: string | null) {
  const choice = await resolveModel(modelId);
  if (!choice) return null;
  const ep = await endpointFor(choice);
  const provider = createOpenAICompatible({ name: "portal", baseURL: ep.baseUrl.replace(/\/$/, ""), apiKey: ep.token });
  return { model: provider.chatModel(ep.model), token: ep.token };
}

/** Error text for the browser, with the model token cut out. */
export function errorText(e: unknown, token?: string): string {
  let text = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
  if (token) text = text.split(token).join("•••");
  return text.slice(0, 500) || "Неизвестная ошибка";
}
