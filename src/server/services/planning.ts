import { prisma, type Db } from "../db";
import { cents, dateIn, dateOut, dec } from "../convert";
import { DomainError } from "../errors";
import { assetInput, budgetInput, debtInput, debtPaymentInput, goalEntryInput, goalInput } from "../schemas";
import type { z } from "zod";
import { accountBalances } from "./accounts";
import { cardOverview } from "./cards";
import { monthSummary } from "./reports";
import { addMonths, d, diffDays, monthKey, monthRange, todayBR, type DateOnly } from "@/domain/dates";
import { budgetStatus, goalProgress, netWorth, simulatePayoff } from "@/domain/planning";
import { percent } from "@/domain/money";

/* ───────────── Orçamentos ───────────── */
export async function upsertBudget(raw: z.input<typeof budgetInput>) {
  const v = budgetInput.parse(raw);
  const cat = await prisma.category.findFirst({ where: { id: v.categoryId, type: "EXPENSE", archivedAt: null } });
  if (!cat) throw new DomainError("Escolha uma categoria de despesa");
  return prisma.budget.upsert({
    where: { categoryId: v.categoryId },
    update: { limit: dec(v.limit), alertAt: v.alertAt },
    create: { categoryId: v.categoryId, limit: dec(v.limit), alertAt: v.alertAt },
  });
}
export const deleteBudget = (id: string) => prisma.budget.delete({ where: { id } });

async function spentByCategory(db: Db, key: string) {
  const { start, end } = monthRange(key);
  const rows = await db.transaction.groupBy({
    by: ["categoryId"], _sum: { amount: true },
    where: { deletedAt: null, type: "EXPENSE", status: "SETTLED", date: { gte: start, lte: end } },
  });
  return new Map(rows.map((r) => [r.categoryId, r._sum.amount ? cents(r._sum.amount) : 0]));
}

export async function budgetOverview(key: string = monthKey(todayBR())) {
  const prev = monthKey(addMonths(monthRange(key).start, -1));
  const [budgets, now, before, summary] = await Promise.all([
    prisma.budget.findMany({ include: { category: true }, orderBy: { createdAt: "asc" } }),
    spentByCategory(prisma, key), spentByCategory(prisma, prev), monthSummary(key),
  ]);
  const items = budgets.map((b) => {
    const spent = now.get(b.categoryId) ?? 0;
    const prevSpent = before.get(b.categoryId) ?? 0;
    return {
      id: b.id, categoryId: b.categoryId, category: b.category.name, alertAt: b.alertAt,
      ...budgetStatus(cents(b.limit), spent, b.alertAt),
      previousSpent: prevSpent, deltaVsPrevious: spent - prevSpent,
    };
  });
  // Categorias que consomem fatia desproporcional da renda (≥ 30% das receitas do mês).
  const heavy = summary.byCategory
    .map((c) => ({ categoryId: c.categoryId, total: c.total, shareOfIncome: percent(c.total, summary.income) }))
    .filter((c) => c.shareOfIncome !== null && c.shareOfIncome >= 30);
  return { month: key, items, heavy };
}

/* ───────────── Metas ───────────── */
export async function createGoal(raw: z.input<typeof goalInput>) {
  const v = goalInput.parse(raw);
  return prisma.goal.create({ data: { ...v, targetAmount: dec(v.targetAmount), targetDate: v.targetDate ? dateIn(v.targetDate) : null } });
}
/** Aporte/retirada: reserva interna; NUNCA vira receita ou despesa. Retirada não pode exceder o acumulado. */
export async function addGoalEntry(raw: z.input<typeof goalEntryInput>) {
  const v = goalEntryInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const goal = await tx.goal.findFirst({ where: { id: v.goalId, archivedAt: null } });
    if (!goal) throw new DomainError("Meta não encontrada");
    const agg = await tx.goalEntry.aggregate({ _sum: { amount: true }, where: { goalId: v.goalId } });
    const saved = agg._sum.amount ? cents(agg._sum.amount) : 0;
    if (saved + v.amount < 0) throw new DomainError("A retirada é maior que o valor acumulado");
    return tx.goalEntry.create({ data: { goalId: v.goalId, amount: dec(v.amount), date: dateIn(v.date), note: v.note } });
  });
}
export const archiveGoal = (id: string) => prisma.goal.update({ where: { id }, data: { archivedAt: new Date() } });

/** Excedente mensal médio dos 3 meses completos anteriores (receitas − despesas efetivadas). */
export async function monthlySurplus(today: DateOnly = todayBR()): Promise<number> {
  const keys = [1, 2, 3].map((i) => monthKey(addMonths(d(today.getUTCFullYear(), today.getUTCMonth() + 1, 1), -i)));
  const results = await Promise.all(keys.map((k) => monthSummary(k)));
  return Math.round(results.reduce((s, r) => s + r.result, 0) / keys.length);
}

export async function goalsOverview(today: DateOnly = todayBR()) {
  const [goals, surplus] = await Promise.all([
    prisma.goal.findMany({ where: { archivedAt: null }, include: { entries: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }),
    monthlySurplus(today),
  ]);
  return {
    monthlySurplus: surplus,
    items: goals.map((g) => {
      const saved = g.entries.reduce((s, e) => s + cents(e.amount), 0);
      const monthsLeft = g.targetDate
        ? Math.max(0, (g.targetDate.getUTCFullYear() - today.getUTCFullYear()) * 12 + g.targetDate.getUTCMonth() - today.getUTCMonth() + (g.targetDate.getUTCDate() >= today.getUTCDate() ? 0 : -1))
        : null;
      const lastEntry = g.entries.reduce<Date | null>((m, e) => (!m || e.date > m ? e.date : m), null);
      return {
        id: g.id, name: g.name, priority: g.priority, description: g.description, target: cents(g.targetAmount), saved,
        targetDate: g.targetDate ? dateOut(g.targetDate) : null,
        daysSinceLastEntry: lastEntry ? diffDays(today, lastEntry) : null,
        ...goalProgress({ target: cents(g.targetAmount), saved, monthsLeft, monthlySurplus: surplus }),
      };
    }),
  };
}

/* ───────────── Dívidas ───────────── */
export async function createDebt(raw: z.input<typeof debtInput>) {
  const v = debtInput.parse(raw);
  return prisma.debt.create({
    data: {
      name: v.name, creditor: v.creditor, originalAmount: dec(v.originalAmount), balance: dec(v.balance),
      monthlyRate: v.monthlyRate?.toString(), installmentAmount: v.installmentAmount ? dec(v.installmentAmount) : null,
      installmentsTotal: v.installmentsTotal, nextDueDate: v.nextDueDate ? dateIn(v.nextDueDate) : null,
    },
  });
}

/**
 * Pagamento de dívida = saída de caixa que reduz o saldo devedor (tipo DEBT_PAYMENT).
 * Não é "despesa": o gasto original, se houve, já foi (ou não) registrado como despesa própria.
 * Juros/multas devem ser lançados como despesa na categoria "Juros e taxas".
 */
export async function payDebt(raw: z.input<typeof debtPaymentInput>) {
  const v = debtPaymentInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const debt = await tx.debt.findFirst({ where: { id: v.debtId, archivedAt: null } });
    if (!debt) throw new DomainError("Dívida não encontrada");
    const balance = cents(debt.balance);
    if (v.amount > balance) throw new DomainError("O pagamento é maior que o saldo devedor");
    const acc = await tx.account.findFirst({ where: { id: v.accountId, archivedAt: null } });
    if (!acc) throw new DomainError("Conta não encontrada");
    await tx.debt.update({
      where: { id: debt.id },
      data: {
        balance: dec(balance - v.amount),
        nextDueDate: debt.nextDueDate && balance - v.amount > 0 ? addMonths(debt.nextDueDate, 1) : debt.nextDueDate,
      },
    });
    return tx.transaction.create({
      data: { type: "DEBT_PAYMENT", status: "SETTLED", settledAt: new Date(), amount: dec(v.amount), date: dateIn(v.date), description: `Pagamento: ${debt.name}`, accountId: v.accountId, debtId: debt.id },
    });
  });
}

export async function debtsOverview(extra = 0) {
  const debts = await prisma.debt.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } });
  return debts.map((x) => {
    const balance = cents(x.balance), pay = x.installmentAmount ? cents(x.installmentAmount) : 0;
    const rate = x.monthlyRate ? Number(x.monthlyRate.toString()) : 0;
    const base = pay > 0 ? simulatePayoff({ balance, monthlyRate: rate, payment: pay }) : null;
    const withExtra = pay > 0 && extra > 0 ? simulatePayoff({ balance, monthlyRate: rate, payment: pay, extra }) : null;
    return {
      id: x.id, name: x.name, creditor: x.creditor, original: cents(x.originalAmount), balance, paid: cents(x.originalAmount) - balance,
      installmentAmount: pay || null, nextDueDate: x.nextDueDate ? dateOut(x.nextDueDate) : null, monthlyRate: rate || null,
      payoffMonths: base?.months ?? null, payoffDate: base?.months ? dateOut(addMonths(todayBR(), base.months)) : null,
      simulation: withExtra && base ? { months: withExtra.months, monthsSaved: base.months !== null && withExtra.months !== null ? base.months - withExtra.months : null, interestSaved: base.totalInterest - withExtra.totalInterest } : null,
    };
  });
}

/* ───────────── Patrimônio ───────────── */
export async function createAsset(raw: z.input<typeof assetInput>) {
  const v = assetInput.parse(raw);
  return prisma.asset.create({ data: { ...v, value: dec(v.value), valueUpdatedAt: dateIn(v.valueUpdatedAt) } });
}
export const updateAssetValue = (id: string, value: number, on: string) =>
  prisma.asset.update({ where: { id }, data: { value: dec(value), valueUpdatedAt: dateIn(on) } });
export const archiveAsset = (id: string) => prisma.asset.update({ where: { id }, data: { archivedAt: new Date() } });

/**
 * Patrimônio líquido = (saldos de contas + bens/investimentos manuais) − (dívidas + faturas em aberto).
 * Limite de crédito nunca entra. Bens vivem só em Asset: não são somados em duplicidade com contas.
 */
export async function netWorthOverview(today: DateOnly = todayBR()) {
  const [accounts, assets, debts, cards] = await Promise.all([
    accountBalances(), prisma.asset.findMany({ where: { archivedAt: null } }),
    prisma.debt.findMany({ where: { archivedAt: null } }), cardOverview(today),
  ]);
  const unpaidInvoices = cards.reduce((s, c) => s + c.invoices.reduce((x, i) => x + i.remaining, 0), 0);
  const nw = netWorth({
    accountBalances: accounts.map((a) => a.balance), assetValues: assets.map((a) => cents(a.value)),
    debtBalances: debts.map((x) => cents(x.balance)), unpaidInvoices,
  });
  return {
    ...nw, unpaidInvoices, debts: debts.reduce((s, x) => s + cents(x.balance), 0),
    accountItems: accounts.map((a) => ({ id: a.id, name: a.name, balance: a.balance })),
    assetItems: assets.map((a) => ({ id: a.id, name: a.name, type: a.type, value: cents(a.value), updatedAt: dateOut(a.valueUpdatedAt) })),
  };
}
