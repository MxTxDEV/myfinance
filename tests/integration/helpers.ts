import { prisma } from "@/server/db";

export async function resetDb() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  const list = rows.map((r) => `"${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export async function seedBasics() {
  const bank = await prisma.account.create({ data: { name: "Conta", type: "CHECKING", initialBalance: "1000.00", initialBalanceDate: new Date("2026-01-01") } });
  const bank2 = await prisma.account.create({ data: { name: "Poupança", type: "SAVINGS", initialBalance: "0.00", initialBalanceDate: new Date("2026-01-01") } });
  const food = await prisma.category.create({ data: { name: "Mercado", type: "EXPENSE" } });
  const salary = await prisma.category.create({ data: { name: "Salário", type: "INCOME" } });
  const card = await prisma.creditCard.create({ data: { name: "Roxo", limit: "5000.00", closingDay: 10, dueDay: 17, payAccountId: bank.id } });
  return { bank, bank2, food, salary, card };
}
