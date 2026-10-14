import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetDb, seedBasics } from "./helpers";
import { createTransaction } from "@/server/services/transactions";
import { accountBalances } from "@/server/services/accounts";
import { addGoalEntry, budgetOverview, createAsset, createDebt, createGoal, debtsOverview, goalsOverview, netWorthOverview, payDebt, upsertBudget } from "@/server/services/planning";
import { generateNotifications } from "@/server/services/notifications";
import { balanceProjection, fixedVsVariable, monthSummary, yearlySeries } from "@/server/services/reports";
import { createRecurring, generateRecurring } from "@/server/services/recurring";
import { invoiceViews } from "@/server/services/cards";
import { d } from "@/domain/dates";

let s: Awaited<ReturnType<typeof seedBasics>>;
beforeEach(async () => { await resetDb(); s = await seedBasics(); });
const spend = (amount: number, date: string, extra: object = {}) =>
  createTransaction({ type: "EXPENSE", amount, description: "Gasto", date, categoryId: s.food.id, accountId: s.bank.id, status: "SETTLED", installments: 1, ...extra });
const earn = (amount: number, date: string) =>
  createTransaction({ type: "INCOME", amount, description: "Salário", date, categoryId: s.salary.id, accountId: s.bank.id, status: "SETTLED", installments: 1 });

describe("orçamento", () => {
  it("gasto, restante, percentual, comparação com mês anterior e categoria pesada", async () => {
    await earn(100000, "2026-10-05");
    await spend(20000, "2026-09-10");
    await spend(40000, "2026-10-10");
    await upsertBudget({ categoryId: s.food.id, limit: 50000, alertAt: [50, 80, 100] });
    const o = await budgetOverview("2026-10");
    expect(o.items[0]).toMatchObject({ spent: 40000, remaining: 10000, usedPercent: 80, level: "near", previousSpent: 20000, deltaVsPrevious: 20000 });
    expect(o.items[0].crossed).toEqual([50, 80]);
    expect(o.heavy[0].shareOfIncome).toBe(40); // 40% da renda
  });
  it("só aceita categoria de despesa", async () => {
    await expect(upsertBudget({ categoryId: s.salary.id, limit: 1000, alertAt: [80] })).rejects.toThrow();
  });
  it("compras no cartão contam no orçamento da data da compra", async () => {
    await createTransaction({ type: "EXPENSE", amount: 30000, description: "Cartão", date: "2026-10-05", categoryId: s.food.id, cardId: s.card.id, status: "SETTLED", installments: 1 });
    await upsertBudget({ categoryId: s.food.id, limit: 100000, alertAt: [50] });
    expect((await budgetOverview("2026-10")).items[0].spent).toBe(30000);
  });
});

describe("metas", () => {
  it("aporte não é receita nem altera saldo; calcula progresso e mensal necessário", async () => {
    const g = await createGoal({ name: "Reserva", targetAmount: 1200000, targetDate: "2027-08-14", priority: 1 });
    await addGoalEntry({ goalId: g.id, amount: 200000, date: "2026-10-01" });
    expect((await accountBalances())[0].balance).toBe(100000);
    expect((await monthSummary("2026-10")).income).toBe(0);
    const o = await goalsOverview(d(2026, 10, 14));
    expect(o.items[0]).toMatchObject({ saved: 200000, percent: 16.7, monthsLeft: 10, monthlyNeeded: 100000 });
  });
  it("retirada acima do acumulado é rejeitada", async () => {
    const g = await createGoal({ name: "X", targetAmount: 10000, priority: 2 });
    await addGoalEntry({ goalId: g.id, amount: 5000, date: "2026-10-01" });
    await expect(addGoalEntry({ goalId: g.id, amount: -6000, date: "2026-10-02" })).rejects.toThrow(/maior/);
    await addGoalEntry({ goalId: g.id, amount: -5000, date: "2026-10-02" });
  });
  it("meta inviável informa projeção realista com base no excedente", async () => {
    await earn(300000, "2026-09-05"); await spend(100000, "2026-09-06"); // excedente 2000/mês no último mês (média de 3 meses)
    const g = await createGoal({ name: "Carro", targetAmount: 1000000, targetDate: "2027-01-14", priority: 1 });
    const o = await goalsOverview(d(2026, 10, 14));
    expect(o.monthlySurplus).toBe(Math.round(200000 / 3));
    const it = o.items.find((x) => x.id === g.id)!;
    expect(it.feasible).toBe(false);
    expect(it.projectedMonths).toBe(Math.ceil(1000000 / Math.round(200000 / 3)));
  });
});

describe("dívidas", () => {
  it("pagamento reduz saldo devedor, sai da conta e não vira despesa", async () => {
    const debt = await createDebt({ name: "Financiamento", originalAmount: 1000000, balance: 800000, monthlyRate: 1.5, installmentAmount: 100000, installmentsTotal: 10, nextDueDate: "2026-10-20" });
    await payDebt({ debtId: debt.id, amount: 100000, date: "2026-10-14", accountId: s.bank.id });
    expect((await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } })).balance.toString()).toBe("7000");
    expect((await accountBalances())[0].balance).toBe(0);
    expect((await monthSummary("2026-10")).expense).toBe(0);
    const [o] = await debtsOverview(50000);
    expect(o.nextDueDate).toBe("2026-11-20");
    expect(o.simulation!.monthsSaved).toBeGreaterThan(0);
    await expect(payDebt({ debtId: debt.id, amount: 700001, date: "2026-10-14", accountId: s.bank.id })).rejects.toThrow(/maior/);
  });
});

describe("patrimônio líquido", () => {
  it("ativos − obrigações, sem somar limite de crédito", async () => {
    await createAsset({ name: "Carro", type: "VEHICLE", value: 4000000, valueUpdatedAt: "2026-10-01" });
    await createDebt({ name: "Empréstimo", originalAmount: 500000, balance: 300000 });
    await createTransaction({ type: "EXPENSE", amount: 20000, description: "Cartão", date: "2026-10-05", categoryId: s.food.id, cardId: s.card.id, status: "SETTLED", installments: 1 });
    const n = await netWorthOverview(d(2026, 10, 14));
    expect(n.assets).toBe(100000 + 4000000);
    expect(n.liabilities).toBe(300000 + 20000);
    expect(n.net).toBe(4100000 - 320000);
  });
});

describe("relatórios", () => {
  it("fixas × variáveis e comprometimento da renda", async () => {
    await earn(500000, "2026-10-01");
    await createRecurring({ description: "Aluguel", type: "EXPENSE", amount: 100000, categoryId: s.food.id, accountId: s.bank.id, recurrence: "MONTHLY", startDate: "2026-10-05" });
    await generateRecurring(d(2026, 10, 14));
    const rent = await prisma.transaction.findFirstOrThrow({ where: { description: "Aluguel" }, orderBy: { date: "asc" } });
    await prisma.transaction.update({ where: { id: rent.id }, data: { status: "SETTLED" } });
    await spend(30000, "2026-10-06");
    expect(await fixedVsVariable("2026-10")).toEqual({ fixed: 100000, variable: 30000, commitmentPercent: 20 });
  });
  it("evolução do saldo em 12 meses e projeção", async () => {
    await earn(100000, "2026-09-10");
    const series = await yearlySeries("2026-10", 3);
    expect(series.map((x) => x.balance)).toEqual([100000, 200000, 200000]);
    await createTransaction({ type: "EXPENSE", amount: 50000, description: "Futuro", date: "2026-11-10", categoryId: s.food.id, accountId: s.bank.id, status: "PLANNED", installments: 1 });
    const proj = await balanceProjection(d(2026, 10, 14), 3);
    expect(proj.map((x) => x.balance)).toEqual([200000, 150000, 150000]);
  });
});

describe("notificações", () => {
  it("são idempotentes e respeitam preferências", async () => {
    await prisma.profile.create({ data: { email: "a@b.c", name: "A", passwordHash: "x", notifyPrefs: { disabled: ["MONTHLY_SUMMARY"] } } });
    await createTransaction({ type: "EXPENSE", amount: 9000, description: "Luz", date: "2026-10-15", categoryId: s.food.id, accountId: s.bank.id, status: "PLANNED", installments: 1 });
    await createTransaction({ type: "EXPENSE", amount: 9000, description: "Água", date: "2026-10-10", categoryId: s.food.id, accountId: s.bank.id, status: "PLANNED", installments: 1 });
    await spend(1000, "2026-09-10");
    const today = d(2026, 10, 14);
    const first = await generateNotifications(today);
    const second = await generateNotifications(today);
    expect(first.created).toBe(2); // luz a vencer + água atrasada; resumo desativado
    expect(second.created).toBe(0);
    const types = (await prisma.notification.findMany()).map((n) => n.type).sort();
    expect(types).toEqual(["DUE_SOON", "OVERDUE"]);
  });
  it("orçamento: um alerta por limite atingido, sem repetir", async () => {
    await upsertBudget({ categoryId: s.food.id, limit: 10000, alertAt: [50, 80, 100] });
    await spend(8500, "2026-10-10");
    await generateNotifications(d(2026, 10, 14));
    await generateNotifications(d(2026, 10, 15));
    expect(await prisma.notification.count({ where: { type: "BUDGET" } })).toBe(1);
    await spend(2000, "2026-10-16");
    await generateNotifications(d(2026, 10, 16));
    expect(await prisma.notification.count({ where: { type: "BUDGET" } })).toBe(2);
  });
  it("fatura próxima do vencimento avisa uma única vez", async () => {
    await createTransaction({ type: "EXPENSE", amount: 5000, description: "C", date: "2026-10-05", categoryId: s.food.id, cardId: s.card.id, status: "SETTLED", installments: 1 });
    const [inv] = await invoiceViews(s.card.id, d(2026, 10, 14));
    await generateNotifications(d(2026, 10, 15)); await generateNotifications(d(2026, 10, 15));
    expect(await prisma.notification.count({ where: { dedupeKey: `inv-due:${inv.id}` } })).toBe(1);
  });
});
