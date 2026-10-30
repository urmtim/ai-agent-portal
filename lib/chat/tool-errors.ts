// A tool call the model got wrong (AI_InvalidToolInputError with zod issues) → lines a person can read.
// Pure, unit-tested in tool-errors.test.ts; anything else is shown as it came.

/** Parameter names in words, per tool; `unit` follows the number. */
const PARAMS: Record<string, Record<string, { label: string; unit?: string }>> = {
  mail_search: { days: { label: "Период", unit: " дн." }, limit: { label: "Писем за раз" }, query: { label: "Запрос" }, from: { label: "Отправитель" } },
  mail_read: { id: { label: "Номер письма" } },
  run_agent: { agentId: { label: "Агент" }, task: { label: "Задача" } },
};

/** Parameters the mail tools share. */
const COMMON: Record<string, { label: string }> = {
  folder: { label: "Папка" }, ids: { label: "Письма" }, id: { label: "Номер письма" }, n: { label: "Номер вложения" }, to: { label: "Кому" },
  cc: { label: "Копия" }, subject: { label: "Тема" }, text: { label: "Текст" }, name: { label: "Название папки" },
};

type Issue = { code?: string; path?: (string | number)[]; maximum?: number; minimum?: number; message?: string };

export function toolErrorText(tool: string, errorText: string | undefined): string {
  const text = errorText ?? "";
  if (!/Invalid input for tool/.test(text)) return text || "Ошибка";
  let value: Record<string, unknown> = {};
  let issues: Issue[] = [];
  try { value = JSON.parse(text.match(/Value: (\{[\s\S]*?\})\.\s*\n/)?.[1] ?? "{}"); } catch { /* no values then */ }
  try { issues = JSON.parse(text.match(/Error message: (\[[\s\S]*\])\s*$/)?.[1] ?? "[]"); } catch { /* fall back below */ }
  if (!issues.length) return text;

  const lines = issues.map((i) => {
    const key = String(i.path?.[0] ?? "");
    const p = PARAMS[tool]?.[key] ?? COMMON[key] ?? { label: key || "Параметр" };
    const got = value[key];
    const asked = got === undefined ? "" : `модель запросила ${String(got)}${p.unit ?? ""}, `;
    if (i.code === "too_big" && i.maximum !== undefined) return `${p.label}: ${asked}можно не больше ${i.maximum}${p.unit ?? ""}`;
    if (i.code === "too_small" && i.minimum !== undefined) return `${p.label}: ${asked}можно не меньше ${i.minimum}${p.unit ?? ""}`;
    if (i.code === "invalid_type") return got === undefined ? `${p.label}: не указан` : `${p.label}: неверное значение ${JSON.stringify(got)}`;
    return `${p.label}: ${i.message ?? "неверное значение"}`;
  });
  // a mail tool's maximum is its connector's limit: say where it is changed
  const limit = tool.startsWith("mail_") && issues.some((i) => i.code === "too_big") ? ["Это лимит коннектора: его меняют на вкладке «Лимиты»."] : [];
  return ["Модель передала инструменту неверные параметры, и он не запустился:", ...lines.map((l) => `- ${l}`), ...limit].join("\n");
}
