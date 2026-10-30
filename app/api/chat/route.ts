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
import { estimateTokens, lastUserIndex, planSummary, summaryInput, trimToolResults } from "@/lib/chat/context";
import { summarizeChat } from "@/lib/chat/summarize";
import { effectiveGuardrails } from "@/lib/agents/policy";
import { CHAT_INSTRUCTIONS } from "@/lib/chat/instructions";
import { withPolicies } from "@/lib/chat/policy-tools";

// One chat turn: the browser sends the whole history (useChat), we check it,
// save it, stream the model's answer with tools and save again with the answer.

const Body = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  messages: z.array(z.unknown()).min(1),
});

/** Signs approval requests so a forged "approved" from the browser can't run an agent. */
function approvalSecret(): Uint8Array {
  return createHash("sha256").update(`chat-tool-approval:${process.env.AUTH_SECRET ?? ""}`).digest();
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

  const assistant = await loadAssistant(user.id);
  let llm: Awaited<ReturnType<typeof chatModel>>;
  try {
    llm = await chatModel(user.id, assistant.modelId); // the chat is the assistant: its model, else the default
  } catch (e) {
    return plain(errorText(e), 400);
  }
  if (!llm) return plain(NO_MODEL_MESSAGE, 400);

  const { tools, activeTools, approval, agents, snapshot } = await chatTools(user, assistant);

  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({ messages: parsed.data.messages, tools });
  } catch {
    return plain("Сообщения чата повреждены", 400);
  }

  const save = (msgs: UIMessage[]) => prisma.chat.upsert({
    where: { id },
    create: { id, ownerId: user.id, messages: JSON.stringify(msgs) },
    update: { messages: JSON.stringify(msgs) },
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

  // the constant instruction (shown read-only in the «Ассистент» window); policies come as get_policies
  const base = CHAT_INSTRUCTIONS;
  const g = effectiveGuardrails(assistant.guardrails);

  // ---- long chats: old tool results in short form; the start retold once the history nears the context ----
  let summary = chat?.summary ?? "", upto = chat?.summaryUpto ?? 0;
  if (upto > 0 && (upto > messages.length || messages[upto - 1]?.id !== chat?.summaryLastId)) { summary = ""; upto = 0; } // history edited
  const trimmed = trimToolResults(messages, lastUserIndex(messages));
  const fixedTokens = estimateTokens(base + summary) + estimateTokens(snapshot) + activeTools.reduce((n, k) => n + estimateTokens(tools[k].description ?? "") + 150, 0);
  const cut = planSummary({ messages: trimmed, summaryUpto: upto, budget: llm.contextTokens, fixedTokens });
  if (cut > upto) {
    try {
      summary = await summarizeChat(llm.model, summary, summaryInput(trimmed.slice(upto, cut)));
      upto = cut;
      await audit("chat", `История чата сжата: пересказано сообщений — ${cut}`, user, "чат");
    } catch (e) {
      console.error("chat summary failed:", errorText(e, llm.token)); // answer anyway, with the old summary
    }
  }
  if (summary !== (chat?.summary ?? "") || upto !== (chat?.summaryUpto ?? 0)) { // the row exists: saved above
    await prisma.chat.update({ where: { id }, data: { summary, summaryUpto: upto, summaryLastId: upto ? messages[upto - 1].id : "" } });
  }

  const result = streamText({
    model: llm.model,
    instructions: summary ? `${base}\n\nКраткое содержание начала разговора (старые сообщения скрыты):\n${summary}` : base,
    // get_policies with its result goes right before the current question — the model can't skip it
    messages: withPolicies(await convertToModelMessages(trimmed.slice(upto), { tools }), snapshot),
    tools,
    activeTools,
    toolApproval: approval,
    experimental_toolApprovalSecret: approvalSecret(),
    stopWhen: isStepCount(g.maxSteps),
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
