import { __setTestUser, currentUserId, prisma, prismaRaw } from "@/server/db";

export async function resetDb() {
  const rows = await prismaRaw.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  const list = rows.map((r) => `"${r.tablename}"`).join(", ");
  await prismaRaw.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  __setTestUser(null);
}

/** Cria um usuário (sem dados) e, se `activate`, o torna o usuário do contexto de teste. */
export async function makeUser(email = "teste@example.com", opts: { activate?: boolean; role?: "USER" | "SUPER_ADMIN" } = {}) {
  const user = await prismaRaw.profile.create({ data: { email, name: email.split("@")[0], passwordHash: "x", role: opts.role ?? "USER" } });
  if (opts.activate !== false) __setTestUser(user.id);
  return user;
}

/** Ajusta as preferências de notificação do usuário do contexto de teste. */
export async function setPrefs(notifyPrefs: object) {
  await prismaRaw.profile.update({ where: { id: currentUserId() }, data: { notifyPrefs } });
}

export async function seedBasics() {
  await makeUser();
  const bank = await prisma.account.create({ data: { name: "Conta", type: "CHECKING", initialBalance: "1000.00", initialBalanceDate: new Date("2026-01-01") } });
  const bank2 = await prisma.account.create({ data: { name: "Poupança", type: "SAVINGS", initialBalance: "0.00", initialBalanceDate: new Date("2026-01-01") } });
  const food = await prisma.category.create({ data: { name: "Mercado", type: "EXPENSE" } });
  const salary = await prisma.category.create({ data: { name: "Salário", type: "INCOME" } });
  const card = await prisma.creditCard.create({ data: { name: "Roxo", limit: "5000.00", closingDay: 10, dueDay: 17, payAccountId: bank.id } });
  return { bank, bank2, food, salary, card };
}
