import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@learning.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin12345";
  const name = process.env.SEED_ADMIN_NAME ?? "Администратор";

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN", status: "ACTIVE" },
    create: { email, name, passwordHash, role: "ADMIN", status: "ACTIVE" },
  });

  // Give the admin access to the demo courses so there is something to see.
  for (const courseSlug of ["safe", "english"]) {
    await prisma.courseAccess.upsert({
      where: { userId_courseSlug: { userId: admin.id, courseSlug } },
      update: {},
      create: { userId: admin.id, courseSlug, grantedBy: admin.id },
    });
  }

  // A default receipts agent for the admin.
  const existingAgent = await prisma.agent.findFirst({
    where: { ownerId: admin.id, type: "RECEIPTS" },
  });
  if (!existingAgent) {
    await prisma.agent.create({
      data: {
        ownerId: admin.id,
        type: "RECEIPTS",
        name: "Чеки из почты",
        config: JSON.stringify({ sinceDays: 30, fromFilter: "", max: 40 }),
      },
    });
  }

  // Demo receipts so the /stats dashboard shows something before live mail.
  const now = new Date();
  const demo: [string, string, number, number][] = [
    // [merchant, category, total, daysAgo]
    ["Пятёрочка", "продукты", 1240, 2],
    ["Пятёрочка", "продукты", 890, 9],
    ["Магнит", "продукты", 2130, 5],
    ["ВкусВилл", "продукты", 1670, 13],
    ["Яндекс Еда", "кафе и рестораны", 980, 3],
    ["Самокат", "продукты", 760, 7],
    ["Аптека Горздрав", "аптека и здоровье", 540, 11],
    ["OZON", "дом и быт", 3480, 18],
    ["Wildberries", "одежда", 4120, 24],
    ["Яндекс Такси", "транспорт", 420, 1],
    ["АЗС Лукойл", "транспорт", 2600, 15],
    ["Кинотеатр", "развлечения", 1100, 20],
    ["Пятёрочка", "продукты", 1530, 34],
    ["Магнит", "продукты", 2040, 41],
    ["МегаФон", "связь и интернет", 700, 30],
  ];
  for (let i = 0; i < demo.length; i++) {
    const [merchant, category, total, daysAgo] = demo[i];
    const purchasedAt = new Date(now.getTime() - daysAgo * 86400000);
    await prisma.receipt.upsert({
      where: { sourceId: `demo-${i}` },
      update: {},
      create: {
        ownerId: admin.id,
        merchant,
        category,
        total,
        currency: "RUB",
        purchasedAt,
        items: "[]",
        sourceId: `demo-${i}`,
        sourceAgent: "demo",
      },
    });
  }

  console.log(`✔ Admin ready: ${email} / ${password}`);
  console.log(`✔ Demo receipts + receipts agent seeded`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
