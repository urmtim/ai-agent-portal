import "server-only";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret";
import { pickModel, type ModelChoice } from "@/lib/llm-pick";

// Minimal OpenAI-compatible chat client. Works with any endpoint that speaks
// the OpenAI /chat/completions format (Ollama, GLM/Zhipu, OpenRouter, ...).
// Which model: the agent's own → the default one in the registry (/models) →
// LLM_BASE_URL / LLM_MODEL / LLM_API_KEY from .env.

type ChatOptions = {
  system?: string;
  user: string;
  temperature?: number;
  json?: boolean; // ask the endpoint for a JSON object (best-effort)
  modelId?: string | null; // agent's model; null/undefined → default
};

type Endpoint = { baseUrl: string; model: string; token?: string };

function envModel(): ModelChoice | null {
  const baseUrl = process.env.LLM_BASE_URL, model = process.env.LLM_MODEL;
  return baseUrl && model ? { source: "env", name: model, baseUrl, model, token: process.env.LLM_API_KEY || undefined } : null;
}

/** The model a call should use, or null when no LLM is configured anywhere. */
export async function resolveModel(agentModelId?: string | null): Promise<ModelChoice | null> {
  const rows = await prisma.llmModel.findMany({ orderBy: { createdAt: "asc" } });
  return pickModel(rows, agentModelId ?? null, envModel());
}

/** Is any LLM available (registry or .env)? */
export async function llmAvailable(): Promise<boolean> {
  return !!(await resolveModel());
}

/** Name of the model in .env when it is the one in use (registry empty), for the Models page. */
export function envModelName(): string | null {
  return envModel()?.model ?? null;
}

export async function endpointFor(choice: ModelChoice): Promise<Endpoint> {
  if (choice.source === "env") return { baseUrl: choice.baseUrl, model: choice.model, token: choice.token };
  let token: string | undefined;
  if (choice.tokenEnc) {
    const t = decryptSecret(choice.tokenEnc);
    if (t === null) throw new Error(`Токен модели «${choice.name}» не читается — введите его заново в разделе «Модели»`);
    token = t;
  }
  return { baseUrl: choice.baseUrl, model: choice.model, token };
}

async function chatCompletions(ep: Endpoint, body: object, signal?: AbortSignal): Promise<Response> {
  return fetch(`${ep.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(ep.token ? { Authorization: `Bearer ${ep.token}` } : {}) },
    body: JSON.stringify({ model: ep.model, ...body }),
    signal,
  });
}

export async function llmChat(opts: ChatOptions): Promise<string> {
  const choice = await resolveModel(opts.modelId);
  if (!choice) throw new Error("LLM не настроена: добавьте модель в разделе «Модели» или задайте LLM_BASE_URL и LLM_MODEL в .env");
  const ep = await endpointFor(choice);

  const messages = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: opts.user },
  ];

  const res = await chatCompletions(ep, {
    messages,
    temperature: opts.temperature ?? 0,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

/** Chat and parse the reply as JSON (tolerates code fences / surrounding prose). */
export async function llmJson<T>(opts: ChatOptions): Promise<T> {
  const raw = await llmChat({ ...opts, json: true });
  return extractJson<T>(raw);
}

export function extractJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall back to the first balanced {...} or [...] block.
    const match = cleaned.match(/[{[][\s\S]*[}\]]/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error("LLM вернул не-JSON ответ");
  }
}

/** One tiny request to see if the model answers. Never puts the token into the message. */
export async function pingModel(ep: Endpoint): Promise<{ ok: boolean; ms: number; message: string }> {
  const t0 = Date.now();
  try {
    const res = await chatCompletions(ep, { messages: [{ role: "user", content: "ping" }], max_tokens: 1, temperature: 0 },
      AbortSignal.timeout(20_000));
    const ms = Date.now() - t0;
    if (res.ok) return { ok: true, ms, message: `✓ Модель ответила — ${ms} мс` };
    let text = (await res.text().catch(() => "")).slice(0, 200);
    if (ep.token) text = text.split(ep.token).join("•••");
    return { ok: false, ms, message: `✕ Сервер ответил ${res.status}${text ? `: ${text}` : ""}` };
  } catch (e) {
    const err = e as Error;
    const why = err.name === "TimeoutError" ? "нет ответа за 20 секунд" : "проверьте адрес и что сервер запущен";
    return { ok: false, ms: Date.now() - t0, message: `✕ Не удалось подключиться — ${why}` };
  }
}

