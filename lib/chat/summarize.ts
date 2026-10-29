import "server-only";
import { generateText, type LanguageModel } from "ai";

// The start of a long chat retold by the chat's own model (see lib/chat/context.ts for when).

const INSTRUCTIONS = [
  "Сожми начало разговора пользователя с ассистентом в краткий пересказ на русском.",
  "Сохрани факты, имена, числа, даты, принятые решения, договорённости и открытые вопросы; что пользователь просил и что уже сделано.",
  "Пиши от третьего лица, без вступлений, не длиннее 1500 символов.",
].join("\n");

/** New summary = previous summary + the next part of the chat (as plain text from summaryInput). */
export async function summarizeChat(model: LanguageModel, previous: string, part: string): Promise<string> {
  const prompt = previous
    ? `Пересказ более раннего начала разговора:\n${previous}\n\nПродолжение разговора:\n${part}`
    : part;
  const { text } = await generateText({ model, instructions: INSTRUCTIONS, prompt });
  const out = text.trim();
  if (!out) throw new Error("Модель вернула пустой пересказ");
  return out.slice(0, 3000);
}
