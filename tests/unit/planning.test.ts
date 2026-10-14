import { describe, expect, it } from "vitest";
import { budgetStatus, goalProgress, netWorth, savingsRate, simulatePayoff } from "@/domain/planning";
import { occurrencesUntil } from "@/domain/recurrence";
import { d, iso } from "@/domain/dates";

describe("taxa de poupança", () => {
  it("fórmula e divisão por zero", () => {
    expect(savingsRate(500000, 400000)).toBe(20);
    expect(savingsRate(0, 1000)).toBeNull();
    expect(savingsRate(100000, 150000)).toBe(-50);
  });
});
describe("orçamento", () => {
  it("calcula restante, percentual e alertas cruzados", () => {
    const s = budgetStatus(100000, 85000);
    expect(s.remaining).toBe(15000);
    expect(s.usedPercent).toBe(85);
    expect(s.crossed).toEqual([50, 80]);
    expect(s.level).toBe("near");
    expect(budgetStatus(100000, 100000).level).toBe("over");
    expect(budgetStatus(100000, 10000).crossed).toEqual([]);
  });
});
describe("metas", () => {
  it("valor mensal necessário e viabilidade", () => {
    const g = goalProgress({ target: 1200000, saved: 200000, monthsLeft: 10, monthlySurplus: 150000 });
    expect(g.monthlyNeeded).toBe(100000);
    expect(g.feasible).toBe(true);
    expect(g.percent).toBe(16.7);
  });
  it("meta inviável traz projeção realista", () => {
    const g = goalProgress({ target: 1200000, saved: 0, monthsLeft: 6, monthlySurplus: 100000 });
    expect(g.feasible).toBe(false);
    expect(g.projectedMonths).toBe(12);
  });
  it("sem excedente não há projeção; meta concluída", () => {
    expect(goalProgress({ target: 1000, saved: 0, monthsLeft: 3, monthlySurplus: -5 }).projectedMonths).toBeNull();
    expect(goalProgress({ target: 1000, saved: 1500, monthsLeft: 3, monthlySurplus: 0 }).percent).toBe(100);
  });
});
describe("patrimônio líquido", () => {
  it("ativos − obrigações; limite de crédito não entra", () => {
    const n = netWorth({ accountBalances: [100000, 50000], assetValues: [3000000], debtBalances: [200000], unpaidInvoices: 30000 });
    expect(n).toEqual({ assets: 3150000, liabilities: 230000, net: 2920000 });
  });
});
describe("dívidas", () => {
  it("simula quitação e pagamento extra reduz prazo", () => {
    const base = simulatePayoff({ balance: 1000000, monthlyRate: 2, payment: 100000 });
    const extra = simulatePayoff({ balance: 1000000, monthlyRate: 2, payment: 100000, extra: 50000 });
    expect(base.months).toBeGreaterThan(extra.months!);
    expect(extra.totalInterest).toBeLessThan(base.totalInterest);
  });
  it("pagamento que não cobre juros nunca quita", () => {
    expect(simulatePayoff({ balance: 1000000, monthlyRate: 5, payment: 40000 }).months).toBeNull();
  });
});
describe("recorrência", () => {
  it("mensal dia 31 não deriva", () => {
    const o = occurrencesUntil({ start: d(2026, 1, 31), kind: "MONTHLY", until: d(2026, 5, 31) }).map(iso);
    expect(o).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });
  it("semanal, quinzenal, anual, personalizado e fim", () => {
    expect(occurrencesUntil({ start: d(2026, 1, 1), kind: "WEEKLY", until: d(2026, 1, 15) }).length).toBe(3);
    expect(occurrencesUntil({ start: d(2026, 1, 1), kind: "BIWEEKLY", until: d(2026, 2, 1) }).length).toBe(3);
    expect(occurrencesUntil({ start: d(2024, 2, 29), kind: "YEARLY", until: d(2026, 3, 1) }).map(iso)).toEqual(["2024-02-29", "2025-02-28", "2026-02-28"]);
    expect(occurrencesUntil({ start: d(2026, 1, 1), kind: "CUSTOM", intervalDays: 10, until: d(2026, 1, 31) }).length).toBe(4);
    expect(occurrencesUntil({ start: d(2026, 1, 1), kind: "MONTHLY", endDate: d(2026, 3, 1), until: d(2026, 12, 1) }).length).toBe(3);
  });
});
