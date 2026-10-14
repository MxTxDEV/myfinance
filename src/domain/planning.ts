import { percent, type Cents } from "./money";

/** Taxa de poupança = resultado ÷ receitas recebidas × 100. Receita zero → null ("Não disponível"). */
export function savingsRate(income: Cents, expense: Cents): number | null {
  return percent(income - expense, income);
}

export type BudgetLevel = "ok" | "attention" | "near" | "over";
export interface BudgetStatus { limit: Cents; spent: Cents; remaining: Cents; usedPercent: number; level: BudgetLevel; crossed: number[] }

export function budgetStatus(limit: Cents, spent: Cents, alertAt: number[] = [50, 80, 100]): BudgetStatus {
  const usedPercent = limit > 0 ? Math.round((spent * 1000) / limit) / 10 : 0;
  const crossed = [...alertAt].sort((a, b) => a - b).filter((t) => usedPercent >= t);
  const level: BudgetLevel = usedPercent >= 100 ? "over" : usedPercent >= 80 ? "near" : usedPercent >= 50 ? "attention" : "ok";
  return { limit, spent, remaining: limit - spent, usedPercent, level, crossed };
}

export interface GoalProgress {
  percent: number; remaining: Cents; monthsLeft: number | null; monthlyNeeded: Cents | null;
  feasible: boolean | null; projectedMonths: number | null;
}

/**
 * Progresso da meta. `monthlySurplus` = média mensal de resultado (receitas − despesas) recente.
 * Viável se monthlyNeeded ≤ monthlySurplus. Projeção realista = meses necessários com o excedente atual.
 */
export function goalProgress(args: {
  target: Cents; saved: Cents; monthsLeft: number | null; monthlySurplus: Cents;
}): GoalProgress {
  const { target, saved, monthsLeft, monthlySurplus } = args;
  const remaining = Math.max(0, target - saved);
  const pct = Math.min(100, Math.round((saved * 1000) / target) / 10);
  if (remaining === 0) return { percent: 100, remaining: 0, monthsLeft, monthlyNeeded: 0, feasible: true, projectedMonths: 0 };
  const projectedMonths = monthlySurplus > 0 ? Math.ceil(remaining / monthlySurplus) : null;
  if (monthsLeft === null) return { percent: pct, remaining, monthsLeft, monthlyNeeded: null, feasible: null, projectedMonths };
  const months = Math.max(1, monthsLeft);
  const monthlyNeeded = Math.ceil(remaining / months);
  return { percent: pct, remaining, monthsLeft, monthlyNeeded, feasible: monthlySurplus >= monthlyNeeded, projectedMonths };
}

/** Patrimônio líquido = ativos − obrigações. Limite de crédito nunca entra. */
export function netWorth(args: {
  accountBalances: Cents[]; assetValues: Cents[]; debtBalances: Cents[]; unpaidInvoices: Cents;
}): { assets: Cents; liabilities: Cents; net: Cents } {
  const sum = (a: Cents[]) => a.reduce((x, y) => x + y, 0);
  const assets = sum(args.accountBalances) + sum(args.assetValues);
  const liabilities = sum(args.debtBalances) + args.unpaidInvoices;
  return { assets, liabilities, net: assets - liabilities };
}

/** Simula quitação de dívida: juros mensais (taxa %/mês) sobre o saldo, pagamento fixo + extra. */
export function simulatePayoff(args: { balance: Cents; monthlyRate: number; payment: Cents; extra?: Cents }):
  { months: number | null; totalInterest: Cents } {
  const pay = args.payment + (args.extra ?? 0);
  let bal = args.balance, months = 0, interest = 0;
  while (bal > 0 && months < 1200) {
    const i = Math.round((bal * args.monthlyRate) / 100);
    if (pay <= i) return { months: null, totalInterest: interest }; // pagamento não cobre juros
    interest += i;
    bal = bal + i - pay;
    months++;
  }
  return { months, totalInterest: interest };
}
