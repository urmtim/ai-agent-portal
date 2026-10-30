"use server";

import { generateText, type UIMessage } from "ai";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { cleanTitle, fallbackTitle } from "@/lib/chat/history";
import { chatModel } from "@/lib/chat/model";
import { audit } from "@/lib/audit";
import { loadAssistant } from "@/lib/assistant";

// Sidebar and header actions. A chat that isn't yours behaves as missing.
// updatedAt is kept on purpose: pinning or renaming must not move a chat to "Сегодня".
// No revalidatePath: the screen keeps its own list, and a refresh would reset the open thread.

async function ownChat(chatId: string) {
  const user = await requireUser();
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  return chat && chat.ownerId === user.id ? Object.assign(chat, { user }) : null;
}

const chatName = (c: { title: string }) => `«${c.title || "Новый чат"}»`;

function textOf(m: UIMessage | undefined): string {
  return (m?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
}

/** Gives a chat its title after the first answer: the model's suggestion or the start of the first message. */
export async function ensureChatTitle(chatId: string): Promise<string | null> {
  const chat = await ownChat(chatId);
  if (!chat) return null;
  if (chat.title) return chat.title;

  const messages = JSON.parse(chat.messages) as UIMessage[];
  const question = textOf(messages.find((m) => m.role === "user"));
  const answer = textOf(messages.find((m) => m.role === "assistant"));
  if (!question) return null;

  let title: string | null = null;
  try {
    const llm = await chatModel(chat.user.id, (await loadAssistant(chat.user.id)).modelId);
    if (!("error" in llm)) {
      const { text } = await generateText({
        model: llm.model,
        instructions: "Придумай короткое название для чата: 2–6 слов, по-русски, без кавычек и точки в конце. Ответь только названием.",
        prompt: `Сообщение пользователя: ${question.slice(0, 1000)}\n\nОтвет ассистента: ${answer.slice(0, 500)}`,
        maxOutputTokens: 30,
        abortSignal: AbortSignal.timeout(20_000),
      });
      title = cleanTitle(text);
    }
  } catch {
    // no title from the model — fall back below
  }
  title ??= fallbackTitle(question);

  await prisma.chat.update({ where: { id: chat.id }, data: { title, updatedAt: chat.updatedAt } });
  return title;
}

export async function pinChat(chatId: string, pinned: boolean) {
  const chat = await ownChat(chatId);
  if (!chat) return;
  await prisma.chat.update({ where: { id: chat.id }, data: { pinned, updatedAt: chat.updatedAt } });
  await audit("chat", `Чат ${chatName(chat)} ${pinned ? "закреплён" : "откреплён"}`, chat.user, "чат");
}

export async function archiveChat(chatId: string, archived: boolean) {
  const chat = await ownChat(chatId);
  if (!chat) return;
  await prisma.chat.update({ where: { id: chat.id }, data: { archived, updatedAt: chat.updatedAt } });
  await audit("chat", `Чат ${chatName(chat)} ${archived ? "отправлен в архив" : "возвращён из архива"}`, chat.user, "чат");
}

export async function deleteChat(chatId: string) {
  const chat = await ownChat(chatId);
  if (!chat) return;
  await prisma.chat.delete({ where: { id: chat.id } });
  await audit("chat", `Удалён чат ${chatName(chat)}`, chat.user, "чат");
}
