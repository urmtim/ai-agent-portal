import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAgent } from "@/lib/agents/runner";
import { AGENT_TYPES } from "@/lib/agents/types";
import { audit } from "@/lib/audit";
import { allowedTools, type AssistantConfig } from "@/lib/assistant-config";

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

export type RunAgentResult =
  | { agent: string; status: "ok" | "error"; summary: string; processed: number; created: number; log: string }
  | { error: string };

export async function chatTools(user: { id: string; name?: string | null }, cfg: AssistantConfig) {
  const userId = user.id;
  // only the agents the base assistant is allowed to run (settings: «Агенты» → «Ассистент»), and only enabled ones
  const agents = await prisma.agent.findMany({ where: { ownerId: userId, enabled: true, id: { in: cfg.agentIds } }, orderBy: { createdAt: "asc" } });

  const tools = {
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
  const activeTools = allowedTools(cfg, agents.map((a) => a.id)) as (keyof typeof tools)[];
  return { tools, activeTools, agents };
}

export type ChatTools = Awaited<ReturnType<typeof chatTools>>["tools"];

/** Name of an agent for the approval card, looked up in the browser from this list. */
export type AgentName = { id: string; name: string };
