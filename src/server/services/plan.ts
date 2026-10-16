import { z } from "zod";
import { prisma, prismaRaw } from "../db";
import { cents, dateOut } from "../convert";
import { DomainError } from "../errors";
import { createRecurring } from "./recurring";
import { fixedOverview } from "./recurring";
import { fixedVsVariable, monthSummary } from "./reports";
import { cardOverview, cardTimeline } from "./cards";
import { budgetSuggestion, simulateDebtPlan, type PlanDebt } from "@/domain/debt-plan";
import { addMonths, clampDay, daysInMonth, iso, monthKey, todayBR, type DateOnly } from "@/domain/dates";

export const planPrefsSchema = z.object({
  income: z.number().int().min(0).max(100_000_000).nullable().default(null), // renda mensal informada (centavos); null = usar a média
  variable: z.number().int().min(0).max(100_000_000).nullable().default(null), // quanto você quer gastar por mês fora os fixos
  strategy: z.enum(["AVALANCHE", "SNOWBALL"]).default("AVALANCHE"),
});
export type PlanPrefs = z.infer<typeof planPrefsSchema>;

export function readPlanPrefs(raw: unknown): PlanPrefs {
  const r = planPrefsSchema.safeParse(raw && typeof raw === "object" ? raw : {});
  return r.success ? r.data : planPrefsSchema.parse({});
}

export async function savePlanPrefs(userId: string, raw: unknown) {
  const v = planPrefsSchema.parse(raw);
  await prismaRaw.profile.update({ where: { id: userId }, data: { planPrefs: v } });
  return v;
}

/** Plano de quitação + orçamento ideal do mês. Tudo calculado com os seus dados (dívidas, despesas fixas, histórico). */
export async function financialPlan(prefsRaw: unknown, today: DateOnly = todayBR()) {
  const prefs = readPlanPrefs(prefsRaw);
  const key = monthKey(today);
  const prevKeys = [1, 2, 3].map((n) => monthKey(addMonths(today, -n)));

  const [debts, fixed, sums, vars, cardsOv, cardRows] = await Promise.all([
    prisma.debt.findMany({ where: { archivedAt: null, balance: { gt: 0 } }, orderBy: { createdAt: "asc" } }),
    fixedOverview(key, today),
    Promise.all(prevKeys.map((k) => monthSummary(k))),
    Promise.all(prevKeys.map((k) => fixedVsVariable(k))),
    cardOverview(today), prisma.creditCard.findMany({ where: { archivedAt: null } }),
  ]);

  const incomes = sums.map((s) => s.income).filter((x) => x > 0);
  const detectedIncome = incomes.length ? Math.round(incomes.reduce((a, b) => a + b, 0) / incomes.length)
    : fixed.items.filter((i) => i.type === "INCOME" && i.active).reduce((s, i) => s + i.monthlyEquivalent, 0);
  const income = prefs.income ?? detectedIncome;
  const variables = vars.map((v) => v.variable).filter((x) => x > 0);
  const avgVariable = variables.length ? Math.round(variables.reduce((a, b) => a + b, 0) / variables.length) : 0;
  const fixedMonthly = fixed.totals.monthlyEquivalent;

  const manual: (PlanDebt & { kind: string; auto: boolean })[] = debts.map((d) => ({
    id: d.id, name: d.name, balance: cents(d.balance), monthlyRate: d.monthlyRate ? Number(d.monthlyRate.toString()) : 0,
    minPayment: d.installmentAmount ? cents(d.installmentAmount) : 0, kind: d.kind, auto: false,
  }));
  // Cartões entram sozinhos: dívida = tudo que foi usado e não foi pago (inclui parcelas futuras); parcela do mês = fatura mais antiga em aberto.
  const cardDebts: (PlanDebt & { kind: string; auto: boolean })[] = [];
  for (const c of cardsOv.filter((x) => x.used > 0)) {
    const tl = await cardTimeline(c.id, today, 6);
    const next = tl.find((i) => i.remaining > 0);
    cardDebts.push({ id: `card:${c.id}`, name: c.name, balance: c.used, monthlyRate: Number(cardRows.find((r) => r.id === c.id)?.monthlyRate?.toString() ?? 0), minPayment: next?.remaining ?? 0, kind: "CARTAO", auto: true });
  }
  const pd = [...manual, ...cardDebts];
  const debtMin = pd.reduce((s, d) => s + d.minPayment, 0);
  const totalDebt = pd.reduce((s, d) => s + d.balance, 0);

  const suggestion = budgetSuggestion({ income, fixed: fixedMonthly, debtMin, avgVariable, hasDebts: pd.length > 0, daysInMonth: daysInMonth(today.getUTCFullYear(), today.getUTCMonth() + 1), chosenVariable: prefs.variable });
  const extra = suggestion.extraForDebts;
  const baseline = simulateDebtPlan(pd, 0, prefs.strategy, false);
  const plans = { AVALANCHE: simulateDebtPlan(pd, extra, "AVALANCHE"), SNOWBALL: simulateDebtPlan(pd, extra, "SNOWBALL") };
  const chosen = plans[prefs.strategy];
  const at = (m: number | null) => (m === null ? null : iso(addMonths(today, m)));

  return {
    prefs, income, detectedIncome, incomeIsManual: prefs.income !== null,
    fixedMonthly, fixedCount: fixed.items.filter((i) => i.type === "EXPENSE" && i.active).length,
    avgVariable, debtMin, totalDebt, suggestion,
    debts: pd.map((d) => ({ ...d, payoffMonth: chosen.perDebt[d.id]?.months ?? null, payoffDate: at(chosen.perDebt[d.id]?.months ?? null), interest: chosen.perDebt[d.id]?.interest ?? 0 })),
    result: { months: chosen.months, date: at(chosen.months), totalInterest: chosen.totalInterest, order: chosen.order.map((o) => ({ ...o, date: at(o.month)! })) },
    baseline: { months: baseline.months, totalInterest: baseline.totalInterest },
    compare: { AVALANCHE: { months: plans.AVALANCHE.months, interest: plans.AVALANCHE.totalInterest }, SNOWBALL: { months: plans.SNOWBALL.months, interest: plans.SNOWBALL.totalInterest } },
    saved: baseline.months !== null && chosen.months !== null ? { months: baseline.months - chosen.months, interest: baseline.totalInterest - chosen.totalInterest } : null,
  };
}

/** Despesa fixa mensal simples: nome, valor e dia do vencimento. Vira um compromisso recorrente (entra em previsões, avisos e orçamento). */
export async function addFixedExpense(raw: { description: string; amount: number; day: number; accountId?: string; cardId?: string; categoryId?: string }, today: DateOnly = todayBR()) {
  const v = z.object({
    description: z.string().trim().min(1, "Dê um nome para a despesa").max(80), amount: z.number().int().min(1, "Informe o valor"),
    day: z.number().int().min(1).max(31), accountId: z.string().optional(), cardId: z.string().optional(), categoryId: z.string().optional(),
  }).parse(raw);
  if (!v.accountId && !v.cardId) throw new DomainError("Escolha de onde sai o pagamento");
  const cats = await prisma.category.findMany({ where: { type: "EXPENSE", archivedAt: null } });
  const categoryId = v.categoryId ?? cats.find((c) => /moradia|contas|fixas|casa/i.test(c.name))?.id ?? cats.find((c) => /^outras/i.test(c.name))?.id ?? cats[0]?.id;
  if (!categoryId) throw new DomainError("Nenhuma categoria de despesa disponível");
  let start = clampDay(today.getUTCFullYear(), today.getUTCMonth() + 1, v.day);
  if (start < today) start = clampDay(addMonths(today, 1).getUTCFullYear(), addMonths(today, 1).getUTCMonth() + 1, v.day);
  return createRecurring({ type: "EXPENSE", description: v.description, amount: v.amount, categoryId, accountId: v.accountId, cardId: v.cardId, recurrence: "MONTHLY", startDate: dateOut(start) } as never);
}
