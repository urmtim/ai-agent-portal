// One-off data fixes run at container start (docker/start.sh) and safe to run again.
// Models made before they became personal have no owner: hand them to the first admin.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) return;
  const { count } = await prisma.llmModel.updateMany({ where: { ownerId: null }, data: { ownerId: admin.id } });
  if (count) console.log(`✔ ${count} model(s) handed to ${admin.email}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
