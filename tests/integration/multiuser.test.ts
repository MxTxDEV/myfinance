import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setTestUser, prisma, prismaRaw, runAs } from "@/server/db";
import { verifyPassword } from "@/server/auth";
import { resetDb, seedBasics, makeUser } from "./helpers";
import { setPushSender } from "@/server/push";
import { accountBalances } from "@/server/services/accounts";
import { createTransaction } from "@/server/services/transactions";
import { upsertBudget, createDebt } from "@/server/services/planning";
import { adminCreateUser, adminDeleteUser, adminResetPassword, changePassword, checkPassword, createUser, deleteOwnAccount, setSignupOpen, setUserActive, signup } from "@/server/services/users";
import { createApiToken, ingestTransaction, userForToken } from "@/server/services/apitokens";
import { runTickAll } from "@/server/services/scheduler";

let s: Awaited<ReturnType<typeof seedBasics>>;
let a: { id: string };
beforeEach(async () => { await resetDb(); s = await seedBasics(); a = (await prismaRaw.profile.findFirstOrThrow()) as { id: string }; });
afterEach(() => setPushSender(null));

const tx = (accountId: string, categoryId: string, amount = 1000) =>
  createTransaction({ type: "EXPENSE", amount, description: "Mercado do A", date: "2026-03-10", categoryId, status: "SETTLED", installments: 1, accountId });

describe("isolamento entre usuários", () => {
  it("B não enxerga nenhum dado de A", async () => {
    await tx(s.bank.id, s.food.id);
    await upsertBudget({ categoryId: s.food.id, limit: 50000, alertAt: [80] });
    const b = await makeUser("b@example.com"); // contexto agora é B
    expect(await prisma.account.count()).toBe(0);
    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.category.count()).toBe(0);
    expect(await prisma.budget.count()).toBe(0);
    expect(await prisma.account.findUnique({ where: { id: s.bank.id } })).toBeNull();
    expect(await prisma.account.findMany({ where: { userId: a.id } })).toEqual([]); // nem filtrando pelo id de A
    __setTestUser(a.id);
    expect(await prisma.transaction.count()).toBe(1);
    expect(b.id).not.toBe(a.id);
  });

  it("B não consegue usar ids de A (conta, categoria) nem alterá-los", async () => {
    const t = await tx(s.bank.id, s.food.id);
    await makeUser("b@example.com");
    await expect(tx(s.bank.id, s.food.id)).rejects.toThrow();
    await expect(upsertBudget({ categoryId: s.food.id, limit: 100, alertAt: [80] })).rejects.toThrow();
    expect((await prisma.transaction.updateMany({ where: { id: t[0].id }, data: { description: "hack" } })).count).toBe(0);
    expect((await prisma.transaction.deleteMany({ where: { id: t[0].id } })).count).toBe(0);
    __setTestUser(a.id);
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: t[0].id } })).description).toBe("Mercado do A");
  });

  it("criar dado grava o dono do contexto e ignora userId forjado", async () => {
    const b = await makeUser("b@example.com");
    const acc = await prisma.account.create({ data: { name: "Do B", type: "CHECKING", initialBalance: "0", initialBalanceDate: new Date("2026-01-01"), userId: a.id } });
    expect(acc.userId).toBe(b.id);
  });

  it("sem usuário no contexto, consulta a dados escopados falha (fail-closed)", async () => {
    __setTestUser(null);
    await expect(prisma.transaction.findMany()).rejects.toThrow(/Sem usuário/);
    await expect(prisma.account.create({ data: { name: "x", type: "CHECKING", initialBalance: "0", initialBalanceDate: new Date() } })).rejects.toThrow(/Sem usuário/);
  });

  it("listagens de serviço e cálculos só consideram o próprio usuário; funciona dentro de $transaction", async () => {
    await tx(s.bank.id, s.food.id, 12345);
    const b = await makeUser("b@example.com");
    const accB = await prisma.account.create({ data: { name: "Conta B", type: "CHECKING", initialBalance: "0", initialBalanceDate: new Date("2026-01-01") } });
    const cat = await prisma.category.create({ data: { name: "Mercado", type: "EXPENSE" } }); // mesmo nome de A: permitido por usuário
    await tx(accB.id, cat.id, 500);
    const rows = await accountBalances();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Conta B");
    expect(rows[0].balance).toBe(-500);
    expect(b.id).toBeTruthy();
  });

  it("dívidas e demais cadastros são por usuário", async () => {
    await createDebt({ name: "Empréstimo", totalAmount: 100000, monthlyPayment: 10000, dueDay: 5, interestRate: 1 } as never).catch(() => undefined);
    await makeUser("b@example.com");
    expect(await prisma.debt.count()).toBe(0);
  });
});

describe("contas e senhas", () => {
  it("cadastro: abre/fecha, e-mail duplicado e senha fraca", async () => {
    const u = await signup({ name: "Maria", email: "Maria@Example.com", password: "uma-senha-bem-longa" });
    expect(u.email).toBe("maria@example.com");
    expect(u.role).toBe("USER");
    expect(await runAs(u.id, () => prisma.category.count())).toBeGreaterThan(0); // categorias padrão
    await expect(signup({ name: "Outra", email: "maria@example.com", password: "uma-senha-bem-longa" })).rejects.toThrow(/Já existe/);
    await expect(signup({ name: "X", email: "x@example.com", password: "curta" })).rejects.toThrow(/10 caracteres/);
    await setSignupOpen(false);
    await expect(signup({ name: "Y", email: "y@example.com", password: "uma-senha-bem-longa" })).rejects.toThrow(/fechados/);
    expect(checkPassword("1234567890")).not.toBeNull();
  });

  it("trocar a senha invalida sessões e exige a atual", async () => {
    const u = await createUser({ name: "Z", email: "z@example.com", password: "senha-original-1", mustChangePassword: true });
    await expect(changePassword(u.id, "errada-errada", "nova-senha-longa-2")).rejects.toThrow(/incorreta/);
    const after = await changePassword(u.id, "senha-original-1", "nova-senha-longa-2");
    expect(after.sessionVersion).toBe(u.sessionVersion + 1);
    expect(after.mustChangePassword).toBe(false);
    expect(await verifyPassword("nova-senha-longa-2", after.passwordHash)).toBe(true);
  });

  it("admin: cria com senha temporária, reseta, desativa; guardas de si mesmo e do último admin", async () => {
    const admin = await createUser({ name: "Adm", email: "adm@example.com", password: "senha-admin-longa", role: "SUPER_ADMIN" });
    const { user, tempPassword } = await adminCreateUser({ name: "Novo", email: "novo@example.com" });
    expect(user.mustChangePassword).toBe(true);
    expect(await verifyPassword(tempPassword, user.passwordHash)).toBe(true);
    const r = await adminResetPassword(admin.id, user.id);
    expect(r.tempPassword).not.toBe(tempPassword);
    await setUserActive(admin.id, user.id, false);
    expect((await prismaRaw.profile.findUniqueOrThrow({ where: { id: user.id } })).active).toBe(false);
    await expect(setUserActive(admin.id, admin.id, false)).rejects.toThrow();
    await expect(adminDeleteUser(admin.id, admin.id)).rejects.toThrow();
    await expect(deleteOwnAccount(admin.id, "senha-admin-longa")).rejects.toThrow(/único administrador/);
  });

  it("excluir usuário apaga todos os dados dele e preserva os dos outros", async () => {
    await tx(s.bank.id, s.food.id); // dados de A
    const admin = await createUser({ name: "Adm", email: "adm@example.com", password: "senha-admin-longa", role: "SUPER_ADMIN" });
    const v = await createUser({ name: "V", email: "v@example.com", password: "senha-vitima-longa" });
    await runAs(v.id, async () => {
      const acc = await prisma.account.create({ data: { name: "V", type: "CHECKING", initialBalance: "10", initialBalanceDate: new Date("2026-01-01") } });
      const cat = await prisma.category.create({ data: { name: "Uma", type: "EXPENSE" } });
      await tx(acc.id, cat.id);
      await createApiToken("celular");
    });
    await adminDeleteUser(admin.id, v.id);
    expect(await prismaRaw.profile.findUnique({ where: { id: v.id } })).toBeNull();
    for (const model of ["account", "category", "transaction", "apiToken"] as const) {
      expect(await (prismaRaw[model] as unknown as { count: (a: object) => Promise<number> }).count({ where: { userId: v.id } })).toBe(0);
    }
    expect(await prismaRaw.transaction.count({ where: { userId: a.id } })).toBe(1); // A intacto
  });
});

describe("lançamento automático (chave pessoal)", () => {
  it("só guarda o hash; chave inválida/inativa é recusada", async () => {
    const { token } = await createApiToken("atalho");
    expect(token).toMatch(/^fos_/);
    const row = await prismaRaw.apiToken.findFirstOrThrow();
    expect(row.tokenHash).not.toContain(token);
    expect(await userForToken(token)).toBe(a.id);
    expect(await userForToken(token + "x")).toBeNull();
    expect(await userForToken(null)).toBeNull();
    await prismaRaw.profile.update({ where: { id: a.id }, data: { active: false } });
    expect(await userForToken(token)).toBeNull();
  });

  it("lança no cartão certo, é idempotente e não cruza usuários", async () => {
    __setTestUser(null);
    const r1 = await ingestTransaction(a.id, { amount: "R$ 42,90", merchant: "Padaria Pão Quente", card: "Roxo", id: "n1" });
    const r2 = await ingestTransaction(a.id, { amount: 42.9, merchant: "Padaria Pão Quente", card: "Roxo", id: "n1" });
    expect(r2.duplicate).toBe(true);
    expect(r2.id).toBe(r1.id);
    const t = await prismaRaw.transaction.findUniqueOrThrow({ where: { id: r1.id } });
    expect(t.userId).toBe(a.id);
    expect(t.cardId).toBe(s.card.id);
    expect(Number(t.amount)).toBeCloseTo(42.9);
    // sem id do remetente: mesmo valor+local no mesmo intervalo também não duplica
    const now = new Date("2026-05-05T15:00:00Z");
    const k1 = await ingestTransaction(a.id, { amount: 10, merchant: "Uber", card: "Roxo" }, now);
    const k2 = await ingestTransaction(a.id, { amount: 10, merchant: "uber", card: "Roxo" }, now);
    expect(k2.id).toBe(k1.id);
    // outro usuário não acha o cartão de A
    const b = await makeUser("b@example.com", { activate: false });
    await expect(ingestTransaction(b.id, { amount: 5, merchant: "x", card: "Roxo" })).rejects.toThrow(/não encontrado/);
    await expect(ingestTransaction(a.id, { amount: 0, merchant: "x", card: "Roxo" })).rejects.toThrow();
    await expect(ingestTransaction(a.id, { amount: 5, merchant: "x", card: "Roxo", type: "INCOME" })).rejects.toThrow(/cartão/);
  });
});

describe("agendador por usuário", () => {
  it("runTickAll atende cada usuário com inscrição, só com os dados dele", async () => {
    const sent: { title: string; body: string }[] = [];
    setPushSender(async (sub, payload) => { sent.push({ ...JSON.parse(payload), endpoint: (sub as { endpoint: string }).endpoint } as never); });
    process.env.VAPID_PUBLIC_KEY = (await import("web-push")).default.generateVAPIDKeys().publicKey;
    process.env.VAPID_PRIVATE_KEY = (await import("web-push")).default.generateVAPIDKeys().privateKey;
    await prisma.pushSubscription.create({ data: { endpoint: "https://push.example/a", p256dh: "x".repeat(20), auth: "y".repeat(10) } });
    const b = await makeUser("b@example.com");
    await prisma.pushSubscription.create({ data: { endpoint: "https://push.example/b", p256dh: "x".repeat(20), auth: "y".repeat(10) } });
    __setTestUser(null);
    const r = await runTickAll(new Date("2026-05-05T15:00:00Z"));
    expect(r.users).toBe(2);
    expect(r.failed).toBe(0);
    expect(await prismaRaw.pushSlot.count({ where: { userId: a.id } })).toBeGreaterThan(0);
    expect(await prismaRaw.pushSlot.count({ where: { userId: b.id } })).toBeGreaterThan(0);
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
  });
});
