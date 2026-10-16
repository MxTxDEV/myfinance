import { describe, expect, it } from "vitest";
import { budgetSuggestion, simulateDebtPlan } from "@/domain/debt-plan";

const card = { id: "c", name: "Cartão", balance: 500_000, monthlyRate: 12, minPayment: 80_000 };
const car = { id: "v", name: "Carro", balance: 3_000_000, monthlyRate: 1.8, minPayment: 120_000 };

describe("simulateDebtPlan", () => {
  it("sem dívidas: zero meses", () => { expect(simulateDebtPlan([], 0, "AVALANCHE")).toMatchObject({ months: 0, totalInterest: 0 }); });
  it("pagamento que não cobre os juros nunca quita", () => {
    expect(simulateDebtPlan([{ ...card, minPayment: 10_000 }], 0, "AVALANCHE").months).toBeNull();
  });
  it("dívida simples sem juros: saldo ÷ parcela", () => {
    const r = simulateDebtPlan([{ id: "a", name: "A", balance: 100_000, monthlyRate: 0, minPayment: 25_000 }], 0, "AVALANCHE");
    expect(r.months).toBe(4); expect(r.totalInterest).toBe(0);
  });
  it("extra acelera e economiza juros; ordem de quitação consistente", () => {
    const base = simulateDebtPlan([card, car], 0, "AVALANCHE", false);
    const plan = simulateDebtPlan([card, car], 100_000, "AVALANCHE");
    expect(plan.months!).toBeLessThan(base.months!);
    expect(plan.totalInterest).toBeLessThan(base.totalInterest);
    expect(plan.order.map((o) => o.id)).toEqual(["c", "v"]); // cartão (12%) primeiro
    expect(plan.order[1].month).toBe(plan.months);
  });
  it("avalanche paga menos juros que bola de neve quando o menor saldo tem taxa menor", () => {
    const small = { id: "s", name: "Pequena", balance: 100_000, monthlyRate: 1, minPayment: 10_000 };
    const big = { id: "b", name: "Grande", balance: 2_000_000, monthlyRate: 10, minPayment: 150_000 };
    const av = simulateDebtPlan([small, big], 100_000, "AVALANCHE");
    const sn = simulateDebtPlan([small, big], 100_000, "SNOWBALL");
    expect(av.totalInterest).toBeLessThanOrEqual(sn.totalInterest);
    expect(sn.order[0].id).toBe("s");
  });
  it("juros somam o que foi cobrado: saldo final zerado", () => {
    const r = simulateDebtPlan([card], 50_000, "AVALANCHE");
    expect(r.months).not.toBeNull();
    expect(r.perDebt.c.interest).toBe(r.totalInterest);
  });
});

describe("budgetSuggestion", () => {
  const base = { daysInMonth: 30, avgVariable: 0 };
  it("déficit: fixos + mínimos maiores que a renda", () => {
    const s = budgetSuggestion({ ...base, income: 300_000, fixed: 250_000, debtMin: 100_000, hasDebts: true });
    expect(s.status).toBe("DEFICIT"); expect(s.shortfall).toBe(50_000);
  });
  it("com dívidas: metade do que sobra para viver, metade para acelerar", () => {
    const s = budgetSuggestion({ ...base, income: 500_000, fixed: 200_000, debtMin: 100_000, hasDebts: true });
    expect(s.reserve).toBe(25_000);
    expect(s.available).toBe(175_000);
    expect(s.variableCap + s.extraForDebts).toBe(s.available);
    expect(s.variableCap).toBe(87_500);
    expect(s.perDay).toBe(2916);
  });
  it("quem já gasta menos mantém o próprio padrão (mínimo de 30%)", () => {
    const s = budgetSuggestion({ ...base, income: 500_000, fixed: 200_000, debtMin: 100_000, hasDebts: true, avgVariable: 60_000 });
    expect(s.variableCap).toBe(60_000);
    const low = budgetSuggestion({ ...base, income: 500_000, fixed: 200_000, debtMin: 100_000, hasDebts: true, avgVariable: 10_000 });
    expect(low.variableCap).toBe(52_500);
  });
  it("valor escolhido recalcula o extra e nunca passa do disponível", () => {
    const s = budgetSuggestion({ ...base, income: 500_000, fixed: 200_000, debtMin: 100_000, hasDebts: true, chosenVariable: 40_000 });
    expect(s.variableCap).toBe(40_000); expect(s.extraForDebts).toBe(135_000);
    expect(budgetSuggestion({ ...base, income: 500_000, fixed: 200_000, debtMin: 100_000, hasDebts: true, chosenVariable: 9_999_999 }).variableCap).toBe(175_000);
  });
  it("sem dívidas: 10% de reserva, 70% para viver", () => {
    const s = budgetSuggestion({ ...base, income: 500_000, fixed: 200_000, debtMin: 0, hasDebts: false });
    expect(s.reserve).toBe(50_000); expect(s.available).toBe(250_000); expect(s.variableCap).toBe(175_000);
  });
});
