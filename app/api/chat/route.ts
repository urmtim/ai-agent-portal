import { createHash } from "node:crypto";
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { chatModel, errorText, NO_MODEL_MESSAGE } from "@/lib/chat/model";
import { chatTools } from "@/lib/chat/tools";

// One chat turn: the browser sends the whole history (useChat), we check it,
// save it, stream the model's answer with tools and save again with the answer.

const Body = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  messages: z.array(z.unknown()).min(1),
  modelId: z.string().nullish(),
});

/** Signs approval requests so a forged "approved" from the browser can't run an agent. */
function approvalSecret(): Uint8Array {
  return createHash("sha256").update(`chat-tool-approval:${process.env.AUTH_SECRET ?? ""}`).digest();
}

function instructions(userName: string, agents: { id: string; name: string }[]): string {
  const today = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "long" }).format(new Date());
  return [
    "Ты — ассистент семейного портала. Отвечай по-русски, коротко и по делу; можно Markdown.",
    `Сегодня ${today}. Пользователь: ${userName}.`,
    "Про траты пользователя спрашивай инструмент get_spending, не выдумывай цифры. Суммы — в рублях.",
    agents.length
      ? `Агенты пользователя запускаются инструментом run_agent (пользователь подтверждает запуск): ${agents.map((a) => `«${a.name}»`).join(", ")}.`
      : "Агентов у пользователя пока нет — их создают в разделе «Агенты».",
    "Если для задачи нет подходящего агента или инструмента, скажи об этом прямо и ничего не делай вместо него.",
  ].join("\n");
}

const plain = (text: string, status: number) => new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return plain("Нужно войти", 401);
  const user = session.user;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return plain("Неверный запрос", 400);
  const { id } = parsed.data;

  const chat = await prisma.chat.findUnique({ where: { id } });
  if (chat && chat.ownerId !== user.id) return plain("Чат не найден", 404);

  // the model picked in the header; an unknown id falls back to the default
  let modelId = parsed.data.modelId === undefined ? chat?.modelId ?? null : parsed.data.modelId;
  if (modelId && !(await prisma.llmModel.findUnique({ where: { id: modelId } }))) modelId = null;

  let llm: Awaited<ReturnType<typeof chatModel>>;
  try {
    llm = await chatModel(modelId);
  } catch (e) {
    return plain(errorText(e), 400);
  }
  if (!llm) return plain(NO_MODEL_MESSAGE, 400);

  const { tools, activeTools, agents } = await chatTools(user.id);

  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({ messages: parsed.data.messages, tools });
  } catch {
    return plain("Сообщения чата повреждены", 400);
  }

  const save = (msgs: UIMessage[]) => prisma.chat.upsert({
    where: { id },
    create: { id, ownerId: user.id, modelId, messages: JSON.stringify(msgs) },
    update: { modelId, messages: JSON.stringify(msgs) },
  });
  await save(messages); // the user's message survives a failing model

  const result = streamText({
    model: llm.model,
    instructions: instructions(user.name ?? "", agents),
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    activeTools,
    toolApproval: { run_agent: "user-approval" },
    experimental_toolApprovalSecret: approvalSecret(),
    stopWhen: isStepCount(5),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
      onEnd: async ({ messages: all }) => { await save(all); },
      onError: (e) => errorText(e, llm.token),
    }),
  });
}
