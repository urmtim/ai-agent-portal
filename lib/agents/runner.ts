import "server-only";
import { prisma } from "@/lib/db";
import { audit, type AuditActor } from "@/lib/audit";
import type { AuditChannel } from "@/lib/audit-events";
import { runReceiptsAgent, type ReceiptsConfig } from "./receipts";
import { runCustomAgent } from "./custom";
import { firstMailConnector, mailAccess } from "@/lib/connections";

const ids = (raw: string): string[] => { try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

/** Who started a run and from where — for the journal. */
export type RunBy = { actor: AuditActor; channel: AuditChannel };

/**
 * Runs one agent, recording an AgentRun with status, counts and a log, and a journal entry.
 * task — what the caller asks («Свой агент» only); depth — 1 when another agent started it.
 */
export async function runAgent(agentId: string, by: RunBy = { actor: null, channel: "система" }, task = "", depth = 0): Promise<string> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error("Агент не найден");

  const run = await prisma.agentRun.create({
    data: { agentId: agent.id, status: "RUNNING" },
  });

  try {
    const config = JSON.parse(agent.config || "{}");
    let result: { processed: number; created: number; log: string[]; summary?: string };

    switch (agent.type) {
      case "RECEIPTS": {
        // the mailbox comes from the agent's «Коннекторы» tab, never from .env
        const conn = await firstMailConnector(agent.ownerId, ids(agent.connectorIds));
        if (!conn) throw new Error("Агенту не добавлена почта: добавьте ящик в разделе «Коннекторы» и агенту на вкладке «Коннекторы»");
        result = await runReceiptsAgent(agent.ownerId, agent.id, config as ReceiptsConfig, agent.modelId, mailAccess(conn));
        break;
      }
      case "CUSTOM": {
        result = await runCustomAgent(agent, task, {
          by,
          depth,
          runNested: async (subId, subTask) => {
            const subRun = await prisma.agentRun.findUniqueOrThrow({ where: { id: await runAgent(subId, by, subTask, depth + 1) } });
            return { status: subRun.status === "OK" ? "ok" : "error", summary: subRun.summary };
          },
        });
        break;
      }
      default:
        throw new Error(`Неизвестный тип агента: ${agent.type}`);
    }

    const summary = result.summary ?? `Обработано писем: ${result.processed}, новых чеков: ${result.created}`;
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "OK",
        finishedAt: new Date(),
        processed: result.processed,
        created: result.created,
        summary,
        log: result.log.join("\n"),
      },
    });
    await audit("agent_run", `Агент «${agent.name}»: ${summary.slice(0, 300)}`, by.actor, by.channel);
  } catch (e) {
    const err = e as Error;
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        summary: err.message,
        log: (err.stack ?? err.message).slice(0, 4000),
      },
    });
    await audit("agent_failed", `Агент «${agent.name}»: ${err.message.slice(0, 300)}`, by.actor, by.channel);
  }

  return run.id;
}
