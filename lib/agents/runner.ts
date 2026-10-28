import "server-only";
import { prisma } from "@/lib/db";
import { runReceiptsAgent, type ReceiptsConfig } from "./receipts";

/** Runs one agent, recording an AgentRun with status, counts and a log. */
export async function runAgent(agentId: string): Promise<string> {
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

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "OK",
        finishedAt: new Date(),
        processed: result.processed,
        created: result.created,
        summary: `Обработано писем: ${result.processed}, новых чеков: ${result.created}`,
        log: result.log.join("\n"),
      },
    });
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
  }

  return run.id;
}
