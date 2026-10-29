import "server-only";
import { generateText, isStepCount, tool, type ToolSet } from "ai";
import { z } from "zod";
import type { Agent } from "@prisma/client";
import { prisma } from "@/lib/db";
import { chatModel, errorText, NO_MODEL_MESSAGE } from "@/lib/chat/model";
import { mailTools } from "@/lib/chat/mail-tools";
import { firstMailConnection } from "@/lib/connections";
import { guardrailInstructions, maskPii } from "./guardrails";
import { agentGuardrails, parseHitl } from "./policy";
import { agentDesc } from "./types";
import type { RunBy } from "./runner";

// «Свой агент»: its instruction + guardrails, its own tools (mail from its MCP tab, the agents on its «Агенты» tab).
// Runs to the end without a human — only subagents with HITL switched off can be called from inside, and only one level deep.

const ids = (raw: string): string[] => { try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const short = (v: unknown, n: number) => { const s = typeof v === "string" ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + "…" : s; };

export type CustomResult = { processed: number; created: number; log: string[]; summary: string };

/** Starts a nested agent run and returns its summary (injected to avoid a runner ↔ custom import cycle). */
export type RunNested = (agentId: string, task: string) => Promise<{ status: "ok" | "error"; summary: string }>;

export async function runCustomAgent(agent: Agent, task: string, ctx: { by: RunBy; depth: number; runNested: RunNested }): Promise<CustomResult> {
  const llm = await chatModel(agent.ownerId, agent.modelId);
  if (!llm) throw new Error(NO_MODEL_MESSAGE);
  const g = agentGuardrails(agent.guardrails);

  const conn = await firstMailConnection(agent.ownerId, ids(agent.mcpIds));
  const tools: ToolSet = conn
    ? mailTools({ conn, who: `Агент «${agent.name}»`, actor: ctx.by.actor, channel: ctx.by.channel, mask: g.maskPii })
    : {};

  // agents it may call: enabled, without confirmation, not itself; nested agents don't call further
  const subs = ctx.depth > 0 ? [] : (await prisma.agent.findMany({
    where: { ownerId: agent.ownerId, enabled: true, id: { in: ids(agent.agentIds).filter((x) => x !== agent.id) } },
    orderBy: { createdAt: "asc" },
  })).filter((a) => !parseHitl(a.hitl).enabled);
  if (subs.length) {
    tools.run_agent = tool({
      description: "Запустить другого агента и получить его итог. Агенты:\n" + subs.map((a) => `- ${a.id}: «${a.name}» — ${agentDesc(a)}`).join("\n"),
      inputSchema: z.object({ agentId: z.string().describe("id агента из списка"), task: z.string().max(2000).optional().describe("Задача для агента") }),
      execute: async ({ agentId, task: subTask }) => {
        const sub = subs.find((a) => a.id === agentId);
        if (!sub) return { error: "Такого агента нет" };
        const r = await ctx.runNested(sub.id, subTask ?? "");
        return { agent: sub.name, ...r };
      },
    });
  }

  const instructions = [
    agent.instruction.trim() || "Ты — агент портала AI Portal. Выполни задачу коротко и по делу.",
    "Отвечай по-русски. Данные не выдумывай: опирайся только на результаты инструментов.",
    conn ? `Почта пользователя (ящик «${conn.name}»): mail_search ищет письма, mail_read открывает письмо.` : "Доступа к почте у тебя нет.",
    guardrailInstructions(g),
  ].filter(Boolean).join("\n");
  const prompt = task.trim() ? (g.maskPii ? maskPii(task.trim()) : task.trim()) : "Выполни свою задачу по инструкции.";

  let res;
  try {
    res = await generateText({ model: llm.model, instructions, prompt, tools, stopWhen: isStepCount(g.maxSteps) });
  } catch (e) {
    throw new Error(errorText(e, llm.token));
  }

  const log: string[] = [`Задача: ${short(prompt, 300)}`];
  let calls = 0;
  for (const step of res.steps) {
    for (const c of step.toolCalls) { calls++; log.push(`→ ${c.toolName} ${short(c.input, 200)}`); }
    for (const r of step.toolResults) log.push(`← ${r.toolName}: ${short(r.output, 400)}`);
  }
  const text = res.text.trim();
  log.push(`Итог: ${text || "—"}`);
  return { processed: calls, created: 0, log, summary: text ? short(text, 300) : "Агент не дал ответа" };
}
