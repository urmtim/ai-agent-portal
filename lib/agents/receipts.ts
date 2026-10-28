import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { llmJson } from "@/lib/llm";
import { fetchRecentEmails, type FetchedEmail } from "@/lib/mailbox";

export type ReceiptsConfig = {
  sinceDays?: number;
  fromFilter?: string;
  max?: number;
};

export const CATEGORIES = [
  "продукты",
  "кафе и рестораны",
  "транспорт",
  "аптека и здоровье",
  "одежда",
  "дом и быт",
  "развлечения",
  "связь и интернет",
  "коммуналка",
  "прочее",
] as const;

type Extracted = {
  isReceipt: boolean;
  merchant?: string;
  total?: number;
  currency?: string;
  purchasedAt?: string; // ISO date
  category?: string;
  items?: { name: string; qty?: number; price?: number }[];
};

const SYSTEM = `Ты извлекаешь данные покупок из писем. Определи, является ли письмо чеком/квитанцией о покупке (магазин, онлайн-заказ, кафе и т.п.).
Верни СТРОГО JSON без пояснений:
{"isReceipt": boolean, "merchant": string, "total": number, "currency": "RUB", "purchasedAt": "YYYY-MM-DD", "category": one of [${CATEGORIES.join(", ")}], "items": [{"name": string, "qty": number, "price": number}]}
Если это не чек — верни {"isReceipt": false}. total — итоговая сумма числом. Категорию выбери наиболее подходящую из списка.`;

function sourceIdFor(email: FetchedEmail): string {
  if (email.messageId) return email.messageId;
  return crypto
    .createHash("sha256")
    .update(`${email.from}|${email.subject}|${email.date?.toISOString() ?? ""}`)
    .digest("hex");
}

export async function runReceiptsAgent(
  ownerId: string,
  agentId: string,
  config: ReceiptsConfig,
  modelId: string | null = null,
): Promise<{ processed: number; created: number; log: string[] }> {
  const log: string[] = [];
  const emails = await fetchRecentEmails({
    sinceDays: config.sinceDays ?? 30,
    fromFilter: config.fromFilter || undefined,
    max: config.max ?? 40,
  });
  log.push(`Получено писем: ${emails.length}`);

  let created = 0;
  for (const email of emails) {
    const sourceId = sourceIdFor(email);

    const existing = await prisma.receipt.findUnique({ where: { sourceId } });
    if (existing) {
      log.push(`• уже есть: ${email.subject.slice(0, 50)}`);
      continue;
    }

    let data: Extracted;
    try {
      data = await llmJson<Extracted>({
        modelId,
        system: SYSTEM,
        user: [
          `От: ${email.from}`,
          `Тема: ${email.subject}`,
          `Дата: ${email.date?.toISOString() ?? ""}`,
          "",
          email.text.slice(0, 6000),
        ].join("\n"),
      });
    } catch (e) {
      log.push(`• ошибка разбора «${email.subject.slice(0, 40)}»: ${(e as Error).message}`);
      continue;
    }

    if (!data.isReceipt || !data.merchant || !data.total) {
      log.push(`• не чек: ${email.subject.slice(0, 50)}`);
      continue;
    }

    const category = CATEGORIES.includes(data.category as (typeof CATEGORIES)[number])
      ? data.category!
      : "прочее";
    const purchasedAt = data.purchasedAt ? new Date(data.purchasedAt) : email.date ?? new Date();

    await prisma.receipt.create({
      data: {
        ownerId,
        merchant: data.merchant,
        total: Number(data.total) || 0,
        currency: data.currency || "RUB",
        purchasedAt: isNaN(purchasedAt.getTime()) ? new Date() : purchasedAt,
        category,
        items: JSON.stringify(data.items ?? []),
        sourceId,
        sourceAgent: agentId,
      },
    });
    created++;
    log.push(`✓ чек: ${data.merchant} — ${data.total} ${data.currency || "RUB"} (${category})`);
  }

  return { processed: emails.length, created, log };
}
