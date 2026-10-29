import "server-only";
import { prisma } from "@/lib/db";
import { audit, type AuditActor } from "@/lib/audit";
import type { AuditChannel } from "@/lib/audit-events";
import { runReceiptsAgent, type ReceiptsConfig } from "./receipts";

/** Who started a run and from where — for the journal. */
export type RunBy = { actor: AuditActor; channel: AuditChannel };

/** Runs one agent, recording an AgentRun with status, counts and a log, and a journal entry. */
export async function runAgent(agentId: string, by: RunBy = { actor: null, channel: "система" }): Promise<string> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error("Агент не найден");

  const run = await prisma.agentRun.create({
    data: { agentId: agent.id, status: "RUNNING" },
  });

  try {
    const config = JSON.parse(agent.config || "{}");
    let result: { processed: number; created: number; log: string[] };

    switch (agent.type) {
      case "RECEIPTS":
        result = await runReceiptsAgent(agent.ownerId, agent.id, config as ReceiptsConfig, agent.modelId);
        break;
      default:
        throw new Error(`Неизвестный тип агента: ${agent.type}`);
    }

    const summary = `Обработано писем: ${result.processed}, новых чеков: ${result.created}`;
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
    await audit("agent_run", `Агент «${agent.name}»: ${summary}`, by.actor, by.channel);
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
