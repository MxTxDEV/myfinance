import { prisma } from "../db";
import { cents, dateOut } from "../convert";
import { accountBalances } from "./accounts";
import { cardOverview } from "./cards";
import { addDays, addMonths, iso, monthRange, todayBR, monthKey, type DateOnly } from "@/domain/dates";
import { savingsRate } from "@/domain/planning";
import { percent, type Cents } from "@/domain/money";

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
    if (t.type === "INCOME") { if (realized) income += v; else plannedIncome += v; }
    else if (realized) expense += v; else plannedExpense += v;
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
export async function dashboard(today: DateOnly = todayBR(), month: string = monthKey(today)) {
  const [accounts, cards, summary] = await Promise.all([accountBalances(), cardOverview(today), monthSummary(month)]);
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

/** Série de 12 meses: receitas, despesas, resultado e saldo acumulado das contas (evolução do saldo). */
export async function yearlySeries(endKey: string = monthKey(todayBR()), months = 12) {
  const first = addMonths(monthRange(endKey).start, -(months - 1));
  const [accounts, rows] = await Promise.all([
    prisma.account.findMany({ where: { archivedAt: null } }),
    prisma.transaction.findMany({
      where: { deletedAt: null, status: "SETTLED", accountId: { not: null }, account: { archivedAt: null } },
      select: { type: true, amount: true, date: true, accountId: true },
    }),
  ]);
  const sign = { INCOME: 1, TRANSFER_IN: 1, EXPENSE: -1, TRANSFER_OUT: -1, INVOICE_PAYMENT: -1, DEBT_PAYMENT: -1 } as const;
  const initial = new Map(accounts.map((a) => [a.id, a]));
  const keys = Array.from({ length: months }, (_, i) => monthKey(addMonths(first, i)));
  const out = [];
  for (const k of keys) {
    const { end: monthEnd } = monthRange(k);
    let balance = 0;
    for (const a of accounts) if (a.initialBalanceDate <= monthEnd) balance += cents(a.initialBalance);
    for (const t of rows) {
      const a = initial.get(t.accountId!)!;
      if (t.date >= a.initialBalanceDate && t.date <= monthEnd) balance += sign[t.type] * cents(t.amount);
    }
    const m = await monthSummary(k);
    out.push({ month: k, income: m.income, expense: m.expense, result: m.result, savingsRate: m.savingsRate, balance });
  }
  return out;
}

/** Fixas = recorrentes + parcelas de compras parceladas; variáveis = o restante. Pagamentos de fatura/dívida ficam fora. */
export async function fixedVsVariable(key: string = monthKey(todayBR())) {
  const { start, end } = monthRange(key);
  const rows = await prisma.transaction.findMany({
    where: { deletedAt: null, type: "EXPENSE", status: "SETTLED", date: { gte: start, lte: end } },
    select: { amount: true, recurringId: true, planId: true },
  });
  let fixed = 0, variable = 0;
  for (const t of rows) { if (t.recurringId || t.planId) fixed += cents(t.amount); else variable += cents(t.amount); }
  const income = (await monthSummary(key)).income;
  const debtPay = await prisma.transaction.aggregate({ _sum: { amount: true }, where: { deletedAt: null, type: "DEBT_PAYMENT", date: { gte: start, lte: end } } });
  const commitments = fixed + (debtPay._sum.amount ? cents(debtPay._sum.amount) : 0);
  return { fixed, variable, commitmentPercent: percent(commitments, income) };
}

/** Projeção do saldo para os próximos `months` meses: saldo atual + previstos − faturas, mês a mês. */
export async function balanceProjection(today: DateOnly = todayBR(), months = 6) {
  const [accounts, planned, cards] = await Promise.all([
    accountBalances(),
    prisma.transaction.findMany({ where: { deletedAt: null, status: "PLANNED", type: { in: ["INCOME", "EXPENSE"] } }, select: { type: true, amount: true, date: true } }),
    cardOverview(today),
  ]);
  let balance = accounts.reduce((s, a) => s + a.balance, 0);
  const invoices = cards.flatMap((c) => c.invoices.filter((i) => i.remaining > 0));
  const out = [];
  for (let i = 0; i < months; i++) {
    const k = monthKey(addMonths(monthRange(monthKey(today)).start, i));
    const { start, end } = monthRange(k);
    const inM = planned.filter((t) => t.date >= start && t.date <= end);
    const inc = inM.filter((t) => t.type === "INCOME").reduce((s, t) => s + cents(t.amount), 0);
    const exp = inM.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + cents(t.amount), 0);
    const inv = invoices.filter((x) => x.dueDate >= iso(start) && x.dueDate <= iso(end)).reduce((s, x) => s + x.remaining, 0);
    balance += inc - exp - inv;
    out.push({ month: k, planned: inc - exp - inv, balance });
  }
  return out;
}
