import "server-only";

// Minimal OpenAI-compatible chat client. Works with any endpoint that speaks
// the OpenAI /chat/completions format (Ollama, GLM/Zhipu, OpenRouter, ...).
// Configure via env: LLM_BASE_URL (up to /v1), LLM_API_KEY, LLM_MODEL.

type ChatOptions = {
  system?: string;
  user: string;
  temperature?: number;
  json?: boolean; // ask the endpoint for a JSON object (best-effort)
};

export function llmConfigured(): boolean {
  return !!(process.env.LLM_BASE_URL && process.env.LLM_MODEL);
}

export async function llmChat(opts: ChatOptions): Promise<string> {
  const base = process.env.LLM_BASE_URL?.replace(/\/$/, "");
  const model = process.env.LLM_MODEL;
  if (!base || !model) {
    throw new Error("LLM не настроен: задайте LLM_BASE_URL и LLM_MODEL в .env");
  }

  const messages = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: opts.user },
  ];

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
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
