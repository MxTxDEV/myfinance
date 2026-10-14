import { prisma } from "../db";
import { cents, dateOut } from "../convert";
import { accountBalances } from "./accounts";
import { cardOverview } from "./cards";
import { addDays, monthRange, todayBR, monthKey, type DateOnly } from "@/domain/dates";
import { savingsRate } from "@/domain/planning";
import type { Cents } from "@/domain/money";

/**
 * Resumo do mês (competência):
 *  - receitas = INCOME efetivadas com data no mês;
 *  - despesas = EXPENSE efetivadas no mês + compras de cartão (reconhecidas na data da compra/parcela);
 *  - transferências, pagamentos de fatura e de dívida NÃO entram (evita contagem dupla).
 */
export async function monthSummary(key: string = monthKey(todayBR())) {
  const { start, end } = monthRange(key);
  const rows = await prisma.transaction.findMany({
    where: { deletedAt: null, date: { gte: start, lte: end }, type: { in: ["INCOME", "EXPENSE"] } },
    select: { type: true, status: true, amount: true, cardId: true, categoryId: true, date: true, dueDate: true },
  });
  let income = 0, expense = 0, plannedIncome = 0, plannedExpense = 0;
  const byCategory = new Map<string, Cents>();
  const byDay = new Map<string, { income: Cents; expense: Cents }>();
  for (const t of rows) {
    const v = cents(t.amount);
    const realized = t.status === "SETTLED";
    if (t.type === "INCOME") realized ? (income += v) : (plannedIncome += v);
    else realized ? (expense += v) : (plannedExpense += v);
    if (realized) {
      const day = dateOut(t.date);
      const e = byDay.get(day) ?? { income: 0, expense: 0 };
      if (t.type === "INCOME") e.income += v; else { e.expense += v; byCategory.set(t.categoryId!, (byCategory.get(t.categoryId!) ?? 0) + v); }
      byDay.set(day, e);
    }
  }
  return {
    month: key, income, expense, result: income - expense, savingsRate: savingsRate(income, expense),
    plannedIncome, plannedExpense,
    byCategory: [...byCategory].map(([categoryId, total]) => ({ categoryId, total })).sort((a, b) => b.total - a.total),
    byDay: [...byDay].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Visão da tela inicial: saldo real, reservado, faturas, saldo projetado e próximos compromissos. */
export async function dashboard(today: DateOnly = todayBR()) {
  const [accounts, cards, summary] = await Promise.all([accountBalances(), cardOverview(today), monthSummary(monthKey(today))]);
  const available = accounts.filter((a) => a.type !== "INVESTMENT").reduce((s, a) => s + a.balance, 0);
  const invested = accounts.filter((a) => a.type === "INVESTMENT").reduce((s, a) => s + a.balance, 0);
  const goalAgg = await prisma.goalEntry.aggregate({ _sum: { amount: true }, where: { goal: { archivedAt: null } } });
  const reserved = goalAgg._sum.amount ? cents(goalAgg._sum.amount) : 0;
  const pendingInvoices = cards.reduce((s, c) => s + c.invoices.reduce((x, i) => x + i.remaining, 0), 0);

  const horizon = addDays(today, 30);
  const upcoming = await prisma.transaction.findMany({
    where: { deletedAt: null, status: "PLANNED", date: { lte: horizon } },
    orderBy: { date: "asc" }, take: 20, include: { category: true },
  });
  const plannedOut = upcoming.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + cents(t.amount), 0);
  const plannedIn = upcoming.filter((t) => t.type === "INCOME").reduce((s, t) => s + cents(t.amount), 0);
  const dueInvoices = cards.flatMap((c) => c.invoices.filter((i) => i.remaining > 0 && i.dueDate <= dateOut(horizon)).map((i) => ({ ...i, cardName: c.name })));

  return {
    available, invested, reserved, free: available - reserved, pendingInvoices,
    // saldo projetado: real + previstos − faturas em aberto (conservador; nunca soma limite de crédito)
    projected: available + plannedIn - plannedOut - pendingInvoices,
    summary,
    upcoming: [
      ...upcoming.map((t) => ({ kind: "tx" as const, id: t.id, date: dateOut(t.date), description: t.description, amount: cents(t.amount), type: t.type, overdue: t.date < today })),
      ...dueInvoices.map((i) => ({ kind: "invoice" as const, id: i.id, date: i.dueDate, description: `Fatura ${i.cardName}`, amount: i.remaining, type: "EXPENSE" as const, overdue: i.status === "OVERDUE" })),
    ].sort((a, b) => a.date.localeCompare(b.date)),
    accounts, cards,
  };
}
