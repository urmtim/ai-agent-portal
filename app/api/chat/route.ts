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
import { loadAssistant } from "@/lib/assistant";
import { audit } from "@/lib/audit";

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

function instructions(userName: string, agents: { id: string; name: string }[], spending: boolean): string {
  const today = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "long" }).format(new Date());
  return [
    "Ты — ассистент портала AI Portal. Отвечай по-русски, коротко и по делу; можно Markdown.",
    `Сегодня ${today}. Пользователь: ${userName}.`,
    spending
      ? "Про траты пользователя спрашивай инструмент get_spending, не выдумывай цифры. Суммы — в рублях."
      : "Доступа к тратам пользователя у тебя нет: он не разрешён в настройках ассистента. О тратах цифр не называй.",
    agents.length
      ? `Тебе разрешено запускать агентов инструментом run_agent (пользователь подтверждает запуск): ${agents.map((a) => `«${a.name}»`).join(", ")}.`
      : "Запускать агентов тебе не разрешено.",
    "Если задача требует агента, MCP или данных, которые тебе не разрешены, прямо скажи, что их можно разрешить в «Агенты → Базовый ассистент», и ничего не делай вместо них.",
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

  const assistant = await loadAssistant(user.id);
  let llm: Awaited<ReturnType<typeof chatModel>>;
  try {
    llm = await chatModel(modelId ?? assistant.modelId); // chat's model → assistant's → default
  } catch (e) {
    return plain(errorText(e), 400);
  }
  if (!llm) return plain(NO_MODEL_MESSAGE, 400);

  const { tools, activeTools, agents } = await chatTools(user, assistant);

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
  if (!chat) await audit("chat", "Создан чат", user, "чат");
  // a fresh "no" to an agent run (approvals are journaled when the run actually starts, in lib/chat/tools.ts)
  for (const p of messages.at(-1)?.role === "assistant" ? messages.at(-1)!.parts : []) {
    const part = p as { type: string; state?: string; approval?: { approved?: boolean }; input?: { agentId?: string } };
    if (part.type === "tool-run_agent" && part.state === "approval-responded" && part.approval?.approved === false) {
      const name = agents.find((a) => a.id === part.input?.agentId)?.name ?? "агент";
      await audit("approval", `Отклонён запуск агента «${name}»`, user, "чат");
    }
  }

  const result = streamText({
    model: llm.model,
    instructions: instructions(user.name ?? "", agents, activeTools.includes("get_spending")),
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
