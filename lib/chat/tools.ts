import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAgent } from "@/lib/agents/runner";
import { agentDesc } from "@/lib/agents/types";
import { effectiveGuardrails, guardDocIds, hitlAsks } from "@/lib/agents/policy";
import { policySnapshot, policyTools } from "@/lib/chat/policy-tools";
import { audit } from "@/lib/audit";
import { allowedTools, type AssistantConfig } from "@/lib/assistant-config";
import { firstMailConnector } from "@/lib/connections";
import { mailTools } from "@/lib/chat/mail-tools";

export type { MailSearchResult, MailReadResult } from "@/lib/chat/mail-tools";

// Tools the chat assistant can call — always scoped to one user's data.
// run_agent acts, so the route asks for approval unless the agent's HITL is «Не спрашивать».
// Mail results are masked when the assistant's guardrails include «Маскирование ПДн».

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

  // the assistant's mailbox: the first switched-on «Почта» connector on its «Коннекторы» tab
  const mailConn = await firstMailConnector(userId, cfg.connectorIds);
  // the assistant's policies (enabled documents only) — returned by get_policies and put before every answer
  const docs = await prisma.guardrailDoc.findMany({ where: { ownerId: userId, enabled: true, id: { in: guardDocIds(cfg.guardrails) } }, select: { name: true, text: true } });
  const snapshot = policySnapshot(cfg.hitl, cfg.guardrails, docs);

  const tools = {
    ...policyTools(snapshot),
    ...mailTools({ conn: mailConn, who: "Ассистент", actor: user, channel: "чат", missing: "Почта не добавлена ассистенту", mask: effectiveGuardrails(cfg.guardrails).maskPii }),
    // removed «Траты» tool: kept only so chats that called it still validate; never in activeTools
    get_spending: tool({
      description: "Устарело: не используется.",
      inputSchema: z.object({ days: z.number().int().min(1).max(365) }),
      execute: async (): Promise<{ error: string }> => ({ error: "Инструмент «Траты» убран" }),
    }),
    run_agent: tool({
      description: "Запустить агента пользователя (перед запуском пользователь подтверждает). Агенты:\n" +
        agents.map((a) => `- ${a.id}: «${a.name}» — ${agentDesc(a)}`).join("\n"),
      inputSchema: z.object({
        agentId: z.string().describe("id агента из списка"),
        task: z.string().max(2000).optional().describe("Задача для агента своими словами (для агентов с инструкцией)"),
      }),
      execute: async ({ agentId, task }): Promise<RunAgentResult> => {
        const agent = agents.find((a) => a.id === agentId);
        if (!agent) return { error: "Такого агента нет" };
        // for agents that need confirmation execute only runs after a verified approval, so this is where it is journaled
        if (hitlAsks(agent.hitl)) await audit("approval", `Подтверждён запуск агента «${agent.name}»`, user, "чат");
        const runId = await runAgent(agent.id, { actor: user, channel: "чат" }, task ?? "");
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
  const activeTools = ["current_time", "get_policies", ...allowedTools(cfg, agents.map((a) => a.id), mailConn ? [mailConn.id] : [])] as (keyof typeof tools)[];
  // HITL per agent: switched off → runs at once; on (and unknown ids) → waits for the user.
  // Until approvals move to the agent's own actions, «on» means: confirm the launch.
  const approval = {
    run_agent: ({ agentId }: { agentId: string }) => { const a = agents.find((x) => x.id === agentId); return a && !hitlAsks(a.hitl) ? undefined : ("user-approval" as const); },
  };
  return { tools, activeTools, approval, agents, mailbox: mailConn?.name ?? null, snapshot };
}

export type ChatTools = Awaited<ReturnType<typeof chatTools>>["tools"];

/** Name of an agent for the approval card, looked up in the browser from this list. */
export type AgentName = { id: string; name: string };
