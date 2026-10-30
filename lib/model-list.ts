// What «Проверить» in the model window says about `GET {baseUrl}/models` (pure, unit-tested in model-list.test.ts).

export type ListResult =
  | { kind: "ok"; models: string[] } // sorted by name
  | { kind: "nolist" } // the server has no list (404/405, not JSON, empty) — the model is typed by hand
  | { kind: "token" } // 401/403
  | { kind: "down" } // no answer at all
  | { kind: "http"; status: number }; // any other error code

/** The models in a /models answer: OpenAI `{ data: [{ id }] }` or Ollama `{ models: [{ name }] }`; sorted, no repeats. */
export function modelNames(body: unknown): string[] {
  const o = (body && typeof body === "object" ? body : {}) as { data?: unknown; models?: unknown };
  const items = Array.isArray(o.data) ? o.data : Array.isArray(o.models) ? o.models : [];
  const names = items.map((x) => {
    if (typeof x === "string") return x;
    const r = (x && typeof x === "object" ? x : {}) as { id?: unknown; name?: unknown; model?: unknown };
    return [r.id, r.name, r.model].find((v): v is string => typeof v === "string") ?? "";
  }).map((s) => s.trim()).filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

/** Turns the HTTP status and the parsed body (undefined when it was not JSON) into a result. */
export function listResult(status: number, body: unknown): ListResult {
  if (status === 401 || status === 403) return { kind: "token" };
  if (status === 404 || status === 405) return { kind: "nolist" };
  if (status >= 400) return { kind: "http", status };
  const models = modelNames(body);
  return models.length ? { kind: "ok", models } : { kind: "nolist" };
}

/** The test request «Сохранить» sends to the model; no status — no answer at all. */
export type Ping = { ok: boolean; ms: number; status?: number; message: string };

/**
 * Why a model can't be saved after its test request, and under which field to say it; null — it answered.
 * The list check can't tell this: some servers (Ollama Cloud) give their list without any token.
 */
export function pingProblem(p: Ping, model: string): { field: "baseUrl" | "token" | "model"; error: string } | null {
  if (p.ok) return null;
  if (p.status === undefined) return { field: "baseUrl", error: "Сервер не отвечает" };
  if (p.status === 401 || p.status === 403) return { field: "token", error: "Неверный токен" };
  if (p.status === 404 || /not.?found|does not exist|unknown model|no such model/i.test(p.message)) return { field: "model", error: `Сервер не знает модель «${model}»` };
  return { field: "model", error: p.message.replace(/^✕\s*/, "") };
}

export function listMessage(r: ListResult): string {
  switch (r.kind) {
    // a list proves the address, not the token: that one is checked by the test request on «Сохранить»
    case "ok": return `✓ Список получен. Моделей: ${r.models.length}`;
    case "nolist": return "⚠ Список моделей недоступен — впишите вручную";
    case "token": return "✕ Неверный токен";
    case "down": return "✕ Сервер не отвечает";
    case "http": return `✕ Сервер ответил ${r.status}`;
  }
}
