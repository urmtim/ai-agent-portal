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
  // (and keep their mailbox on the MCP tab). They no longer write to «Траты».
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
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
