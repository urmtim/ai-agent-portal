// One-off data fixes run at container start (docker/start.sh) and safe to run again.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Models made before they became personal have no owner: hand them to the first admin.
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (admin) {
    const { count } = await prisma.llmModel.updateMany({ where: { ownerId: null }, data: { ownerId: admin.id } });
    if (count) console.log(`✔ ${count} model(s) handed to ${admin.email}`);
  }

  // Built-in «Чеки из почты» agents are gone from the portal: they become «Свои» with an instruction about receipts
  // (and keep their mailbox, now on the «Коннекторы» tab). They no longer write to «Траты».
  const receipts = await prisma.agent.findMany({ where: { type: "RECEIPTS" } });
  for (const a of receipts) {
    let cfg: { sinceDays?: number; fromFilter?: string } = {};
    try { cfg = JSON.parse(a.config || "{}"); } catch { /* defaults below */ }
    const days = cfg.sinceDays ?? 30;
    const from = cfg.fromFilter?.trim() ? ` от отправителя «${cfg.fromFilter.trim()}»` : "";
    await prisma.agent.update({
      where: { id: a.id },
      data: {
        type: "CUSTOM",
        instruction: a.instruction.trim() ||
          `Найди в почте письма с чеками и квитанциями о покупках за последние ${days} дней${from}.\n` +
          "Перечисли покупки списком: магазин, дата, сумма. В конце — общая сумма.",
      },
    });
  }
  if (receipts.length) console.log(`✔ ${receipts.length} «Чеки из почты» agent(s) turned into «Свои»`);

  // No more «модель по умолчанию»: the assistant and every agent without a model get the old default
  // (or the earliest model) explicitly, so nothing silently runs on another model.
  const owners = await prisma.llmModel.groupBy({ by: ["ownerId"], where: { ownerId: { not: null } } });
  for (const { ownerId } of owners) {
    if (!ownerId) continue;
    const model = await prisma.llmModel.findFirst({ where: { ownerId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
    if (!model) continue;
    const agents = await prisma.agent.updateMany({ where: { ownerId, modelId: null }, data: { modelId: model.id } });
    const a = await prisma.assistant.findUnique({ where: { ownerId }, select: { modelId: true } });
    if (!a) await prisma.assistant.create({ data: { ownerId, modelId: model.id } });
    else if (!a.modelId) await prisma.assistant.update({ where: { ownerId }, data: { modelId: model.id } });
    const assistant = !a || !a.modelId;
    if (agents.count || assistant) console.log(`✔ «${model.name}» chosen explicitly for ${assistant ? "the assistant and " : ""}${agents.count} agent(s)`);
  }

  // Mailboxes moved from «MCP» to «Коннекторы»: their ids go from mcpIds to connectorIds (mcpIds is for MCP servers now).
  // Only while connectorIds is still empty, so running again changes nothing.
  const connectorIds = new Set((await prisma.connector.findMany({ select: { id: true } })).map((c) => c.id));
  const moved = (raw: string) => { try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter((id) => connectorIds.has(id)) : []; } catch { return []; } };
  let fixed = 0;
  for (const a of await prisma.agent.findMany({ where: { connectorIds: "[]" }, select: { id: true, mcpIds: true } })) {
    const ids = moved(a.mcpIds);
    if (!ids.length) continue;
    await prisma.agent.update({ where: { id: a.id }, data: { connectorIds: JSON.stringify(ids), mcpIds: "[]", mcpAccess: "{}" } });
    fixed++;
  }
  for (const a of await prisma.assistant.findMany({ where: { connectorIds: "[]" }, select: { ownerId: true, mcpIds: true } })) {
    const ids = moved(a.mcpIds);
    if (!ids.length) continue;
    await prisma.assistant.update({ where: { ownerId: a.ownerId }, data: { connectorIds: JSON.stringify(ids), mcpIds: "[]", mcpAccess: "{}" } });
    fixed++;
  }
  if (fixed) console.log(`✔ mailboxes moved to «Коннекторы» for ${fixed} agent(s) and assistant(s)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
