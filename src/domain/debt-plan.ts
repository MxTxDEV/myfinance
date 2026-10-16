import type { Cents } from "./money";

export type Strategy = "AVALANCHE" | "SNOWBALL";
export interface PlanDebt { id: string; name: string; balance: Cents; monthlyRate: number; minPayment: Cents }
export interface PlanResult {
  months: number | null; // null = com esse valor a dívida nunca zera
  totalInterest: Cents;
  order: { id: string; name: string; month: number }[]; // em que mês cada dívida zera (ordem de quitação)
  perDebt: Record<string, { months: number | null; interest: Cents }>;
}

const MAX_MONTHS = 600;

/**
 * Simula quitar TODAS as dívidas. O valor mensal total (mínimos + extra) é constante: quando uma dívida zera, o
 * valor que ia para ela passa para a próxima ("bola de neve"). Avalanche ataca a maior taxa primeiro (menos juros);
 * Bola de neve ataca o menor saldo primeiro (vitórias rápidas). `rollover=false` = cada dívida paga só o próprio mínimo (referência).
 */
export function simulateDebtPlan(debts: PlanDebt[], extra: Cents, strategy: Strategy, rollover = true): PlanResult {
  const st = debts.filter((d) => d.balance > 0).map((d) => ({ ...d, bal: d.balance, interest: 0, done: null as number | null }));
  const budget = st.reduce((s, d) => s + d.minPayment, 0) + Math.max(0, extra);
  const result: PlanResult = { months: 0, totalInterest: 0, order: [], perDebt: {} };
  if (st.length === 0) return result;
  if (budget <= 0) return finish(st, result, null);

  for (let month = 1; month <= MAX_MONTHS; month++) {
    for (const d of st) if (d.done === null) { const i = Math.round((d.bal * d.monthlyRate) / 100); d.bal += i; d.interest += i; }
    let pool = rollover ? budget : 0;
    const active = st.filter((d) => d.done === null);
    // 1) mínimos
    for (const d of active) {
      const pay = Math.min(d.minPayment, d.bal);
      d.bal -= pay;
      if (rollover) pool -= pay; else if (!rollover) pool = 0;
      if (d.bal === 0) d.done = month;
    }
    // 2) sobra (extra + mínimos liberados) na dívida prioritária
    if (rollover) {
      const order = active.filter((d) => d.done === null).sort((a, b) => (strategy === "AVALANCHE" ? b.monthlyRate - a.monthlyRate || a.bal - b.bal : a.bal - b.bal || b.monthlyRate - a.monthlyRate));
      for (const d of order) {
        if (pool <= 0) break;
        const pay = Math.min(pool, d.bal);
        d.bal -= pay; pool -= pay;
        if (d.bal === 0) d.done = month;
      }
    }
    if (st.every((d) => d.done !== null)) return finish(st, result, month);
    if (month === MAX_MONTHS) break;
  }
  return finish(st, result, null);
}

function finish(st: { id: string; name: string; interest: number; done: number | null }[], r: PlanResult, months: number | null): PlanResult {
  r.months = months;
  r.totalInterest = st.reduce((s, d) => s + d.interest, 0);
  r.perDebt = Object.fromEntries(st.map((d) => [d.id, { months: d.done, interest: d.interest }]));
  r.order = st.filter((d) => d.done !== null).map((d) => ({ id: d.id, name: d.name, month: d.done! })).sort((a, b) => a.month - b.month);
  return r;
}

export type BudgetStatus = "DEFICIT" | "TIGHT" | "OK";
export interface BudgetSuggestion {
  income: Cents; fixed: Cents; debtMin: Cents;
  reserve: Cents; // guardado/emergência (5% da renda com dívidas, 10% sem)
  available: Cents; // renda − fixos − mínimos − reserva
  variableCap: Cents; // quanto pode gastar no mês com o que não é fixo (mercado, lazer, transporte…)
  extraForDebts: Cents; // o que sobra para acelerar a quitação (ou guardar, se não houver dívida)
  perDay: Cents;
  status: BudgetStatus;
  shortfall: Cents; // quanto falta para fechar o mês só com fixos e mínimos
}

/**
 * Orçamento ideal do mês. Com dívidas, metade do que sobra vai para viver e metade para acelerar a quitação;
 * se você já gasta menos que isso, o ideal acompanha o seu gasto (nunca menos que 30% do que sobra).
 * `chosenVariable` (o valor que você escolheu) tem prioridade e recalcula o extra.
 */
export function budgetSuggestion(a: { income: Cents; fixed: Cents; debtMin: Cents; avgVariable: Cents; hasDebts: boolean; daysInMonth: number; chosenVariable?: Cents | null }): BudgetSuggestion {
  const { income, fixed, debtMin } = a;
  const reserve = Math.round(income * (a.hasDebts ? 0.05 : 0.1));
  const committed = fixed + debtMin;
  const available = income - committed - reserve;
  const base = { income, fixed, debtMin, reserve, perDay: 0 };
  if (income <= 0) return { ...base, available: 0, variableCap: 0, extraForDebts: 0, status: "DEFICIT", shortfall: 0 };
  if (income - committed <= 0) return { ...base, available: 0, variableCap: 0, extraForDebts: 0, status: "DEFICIT", shortfall: committed - income };
  if (available <= 0) {
    const cap = income - committed;
    return { ...base, reserve: 0, available: cap, variableCap: cap, extraForDebts: 0, status: "TIGHT", shortfall: 0, perDay: Math.floor(cap / a.daysInMonth) };
  }
  let cap: number;
  if (a.chosenVariable != null) cap = Math.min(Math.max(0, a.chosenVariable), available);
  else {
    const target = Math.round(available * (a.hasDebts ? 0.5 : 0.7));
    cap = a.avgVariable > 0 && a.avgVariable < target ? Math.max(a.avgVariable, Math.round(available * 0.3)) : target;
  }
  return { ...base, available, variableCap: cap, extraForDebts: available - cap, status: "OK", shortfall: 0, perDay: Math.floor(cap / a.daysInMonth) };
}
