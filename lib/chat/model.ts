import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { endpointFor, resolveModel } from "@/lib/llm";
import { noModelMessage } from "@/lib/llm-pick";
import { toolErrorText } from "@/lib/chat/tool-errors";

type ChatLlm = { model: ReturnType<ReturnType<typeof createOpenAICompatible>["chatModel"]>; token?: string; contextTokens: number };

/**
 * The chat's (or an agent's) model as an AI SDK language model (any OpenAI-compatible endpoint).
 * Same choice as the rest of the portal: the given model; .env only while the owner has no models.
 * `{ error }` says why there is none — nothing is silently replaced by another model.
 */
export async function chatModel(ownerId: string, modelId?: string | null): Promise<{ error: string } | ChatLlm> {
  const choice = await resolveModel(ownerId, modelId);
  if ("none" in choice) return { error: noModelMessage(choice) };
  const ep = await endpointFor(choice);
  const provider = createOpenAICompatible({ name: "portal", baseURL: ep.baseUrl.replace(/\/$/, ""), apiKey: ep.token });
  return { model: provider.chatModel(ep.model), token: ep.token, contextTokens: choice.contextTokens };
}

/** Error text for the browser, with the model token cut out; a tool call the model got wrong is told in words (whole, before the cut). */
export function errorText(e: unknown, token?: string): string {
  let text = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
  if (token) text = text.split(token).join("•••");
  const tool = text.match(/Invalid input for tool (\w+)/)?.[1];
  if (tool) text = toolErrorText(tool, text);
  return text.slice(0, 500) || "Неизвестная ошибка";
}
