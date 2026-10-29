import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAgent } from "@/lib/agents/runner";
import { AGENT_TYPES } from "@/lib/agents/types";
import { audit } from "@/lib/audit";
import { allowedTools, type AssistantConfig } from "@/lib/assistant-config";
import { firstMailConnection, mailAccess } from "@/lib/connections";
import { mailError, readEmail, searchEmails, type MailLetter, type MailSummary } from "@/lib/mailbox";

// Tools the chat assistant can call — always scoped to one user's data.
// run_agent acts (reads mail, writes receipts), so the route requires approval for it.

/** Output of the removed «Траты» tool — still rendered in old chats. */
export type SpendingResult = {
  days: number;
  total: number;
  count: number;
  categories: { category: string; total: number }[];
  topMerchants: { merchant: string; total: number }[];
};

export type MailSearchResult = { mailbox: string; total: number; letters: MailSummary[] } | { error: string };
export type MailReadResult = { mailbox: string; letter: MailLetter } | { error: string };

export type RunAgentResult =
  | { agent: string; status: "ok" | "error"; summary: string; processed: number; created: number; log: string }
  | { error: string };

export async function chatTools(user: { id: string; name?: string | null }, cfg: AssistantConfig) {
  const userId = user.id;
  // only the agents the base assistant is allowed to run (settings: «Агенты» → «Ассистент»), and only enabled ones
  const agents = await prisma.agent.findMany({ where: { ownerId: userId, enabled: true, id: { in: cfg.agentIds } }, orderBy: { createdAt: "asc" } });

  // the assistant's mailbox: the first «Почта» connection on its MCP tab
  const mailConn = await firstMailConnection(userId, cfg.mcpIds);
  const mail = () => {
    if (!mailConn) throw new Error("Почта не добавлена ассистенту");
    return mailAccess(mailConn);
  };

  const tools = {
    mail_search: tool({
      description: "Искать письма в почте пользователя (только чтение). Без запроса — просто последние письма за период. Возвращает id, дату, отправителя, тему и начало текста.",
      inputSchema: z.object({
        query: z.string().max(200).optional().describe("Слова для поиска в теме, тексте или отправителе"),
        from: z.string().max(200).optional().describe("Часть адреса или имени отправителя"),
        days: z.number().int().min(1).max(90).describe("За сколько последних дней, обычно 1–7"),
        unreadOnly: z.boolean().optional().describe("Только непрочитанные"),
        limit: z.number().int().min(1).max(20).optional().describe("Сколько писем вернуть, по умолчанию 10"),
      }),
      execute: async (q): Promise<MailSearchResult> => {
        try {
          const r = await searchEmails(mail(), { ...q, limit: q.limit ?? 10 });
          await audit("tool", `Ассистент искал письма в «${mailConn!.name}» за ${q.days} дн.: найдено ${r.total}`, user, "чат");
          return { mailbox: mailConn!.name, ...r };
        } catch (e) {
          return { error: e instanceof Error && /не добавлена|не читается|не до конца/.test(e.message) ? e.message : mailError(e) };
        }
      },
    }),
    mail_read: tool({
      description: "Прочитать одно письмо целиком по его id из mail_search. Письмо не помечается прочитанным.",
      inputSchema: z.object({ id: z.number().int().positive().describe("id письма из mail_search") }),
      execute: async ({ id }): Promise<MailReadResult> => {
        try {
          const letter = await readEmail(mail(), id);
          if (!letter) return { error: "Такого письма нет" };
          await audit("tool", `Ассистент открыл письмо в «${mailConn!.name}»`, user, "чат");
          return { mailbox: mailConn!.name, letter };
        } catch (e) {
          return { error: e instanceof Error && /не добавлена|не читается|не до конца/.test(e.message) ? e.message : mailError(e) };
        }
      },
    }),
    // removed «Траты» tool: kept only so chats that called it still validate; never in activeTools
    get_spending: tool({
      description: "Устарело: не используется.",
      inputSchema: z.object({ days: z.number().int().min(1).max(365) }),
      execute: async (): Promise<{ error: string }> => ({ error: "Инструмент «Траты» убран" }),
    }),
    run_agent: tool({
      description: "Запустить агента пользователя (перед запуском пользователь подтверждает). Агенты:\n" +
        agents.map((a) => `- ${a.id}: «${a.name}» — ${AGENT_TYPES[a.type].desc}`).join("\n"),
      inputSchema: z.object({ agentId: z.string().describe("id агента из списка") }),
      execute: async ({ agentId }): Promise<RunAgentResult> => {
        const agent = agents.find((a) => a.id === agentId);
        if (!agent) return { error: "Такого агента нет" };
        // execute only runs after a verified approval, so this is where it is journaled
        await audit("approval", `Подтверждён запуск агента «${agent.name}»`, user, "чат");
        const runId = await runAgent(agent.id, { actor: user, channel: "чат" });
        const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
        return {
          agent: agent.name,
          status: run.status === "OK" ? "ok" : "error",
          summary: run.summary,
          processed: run.processed,
          created: run.created,
          log: run.log.slice(-1500),
        };
      },
    }),
  };

  // every tool stays defined so stored history validates; the model is offered only the allowed ones
  const activeTools = allowedTools(cfg, agents.map((a) => a.id), mailConn ? [mailConn.id] : []) as (keyof typeof tools)[];
  return { tools, activeTools, agents, mailbox: mailConn?.name ?? null };
}

export type ChatTools = Awaited<ReturnType<typeof chatTools>>["tools"];

/** Name of an agent for the approval card, looked up in the browser from this list. */
export type AgentName = { id: string; name: string };
