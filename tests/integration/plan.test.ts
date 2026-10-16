import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetDb, seedBasics } from "./helpers";
import { addFixedExpense, financialPlan, readPlanPrefs } from "@/server/services/plan";
import { createDebt, updateDebt } from "@/server/services/planning";
import { createTransaction } from "@/server/services/transactions";
import { personalStats } from "@/server/services/personal";
import { d } from "@/domain/dates";

let s: Awaited<ReturnType<typeof seedBasics>>;
const TODAY = d(2026, 10, 16);
beforeEach(async () => { await resetDb(); s = await seedBasics(); });

describe("plano financeiro", () => {
  it("despesa fixa simples vira compromisso mensal na próxima data e entra no total", async () => {
    await addFixedExpense({ description: "Aluguel", amount: 150000, day: 5, accountId: s.bank.id }, TODAY);
    const r = await prisma.recurringCommitment.findFirstOrThrow();
    expect(r.recurrence).toBe("MONTHLY");
    expect(r.startDate.toISOString().slice(0, 10)).toBe("2026-11-05"); // dia 5 já passou em outubro
    const p = await financialPlan({ income: 500000 }, TODAY);
    expect(p.fixedMonthly).toBe(150000);
    expect(p.fixedCount).toBe(1);
  });

  it("orçamento ideal e plano de quitação com cartão, carro e outra dívida", async () => {
    await addFixedExpense({ description: "Aluguel", amount: 150000, day: 20, accountId: s.bank.id }, TODAY);
    await createDebt({ name: "Cartão Inter", originalAmount: 500000, balance: 500000, monthlyRate: 12, installmentAmount: 80000, kind: "CARTAO" });
    await createDebt({ name: "Carro", originalAmount: 3000000, balance: 3000000, monthlyRate: 1.8, installmentAmount: 120000, kind: "VEICULO" });
    const p = await financialPlan({ income: 600000, strategy: "AVALANCHE" }, TODAY);
    expect(p.suggestion.status).toBe("OK");
    expect(p.debtMin).toBe(200000);
    expect(p.suggestion.available).toBe(600000 - 150000 - 200000 - 30000);
    expect(p.suggestion.variableCap + p.suggestion.extraForDebts).toBe(p.suggestion.available);
    expect(p.result.months).not.toBeNull();
    expect(p.result.order[0].name).toBe("Cartão Inter"); // maior juro primeiro
    expect(p.saved!.months).toBeGreaterThan(0); expect(p.saved!.interest).toBeGreaterThan(0);
    // escolher gastar menos libera mais extra e quita antes
    const lean = await financialPlan({ income: 600000, variable: 20000 }, TODAY);
    expect(lean.suggestion.extraForDebts).toBeGreaterThan(p.suggestion.extraForDebts);
    expect(lean.result.months!).toBeLessThanOrEqual(p.result.months!);
  });

  it("renda média dos últimos 3 meses quando não informada; atualizar dívida muda o plano", async () => {
    for (const date of ["2026-07-10", "2026-08-10", "2026-09-10"]) {
      await createTransaction({ type: "INCOME", amount: 400000, description: "Salário", date, categoryId: s.salary.id, status: "SETTLED", installments: 1, accountId: s.bank.id });
    }
    const debt = await createDebt({ name: "Empréstimo", originalAmount: 100000, balance: 100000, installmentAmount: 25000 });
    const p = await financialPlan({ variable: 100_000_000 }, TODAY); // gasto máximo: sem extra, só a parcela
    expect(p.income).toBe(400000); expect(p.incomeIsManual).toBe(false);
    expect(p.result.months).toBe(4);
    await updateDebt(debt.id, { balance: 50000 });
    const after = await financialPlan({ variable: 100_000_000 }, TODAY);
    expect(after.totalDebt).toBe(50000);
    expect(after.result.months).toBe(2);
  });

  it("deficit: avisa quanto falta quando fixos + parcelas passam da renda", async () => {
    await addFixedExpense({ description: "Aluguel", amount: 300000, day: 20, accountId: s.bank.id }, TODAY);
    await createDebt({ name: "Carro", originalAmount: 100000, balance: 100000, installmentAmount: 100000 });
    const p = await financialPlan({ income: 350000 }, TODAY);
    expect(p.suggestion.status).toBe("DEFICIT"); expect(p.suggestion.shortfall).toBe(50000);
  });

  it("preferências inválidas voltam ao padrão", () => { expect(readPlanPrefs({ strategy: "X" }).strategy).toBe("AVALANCHE"); });
});

describe("números para mensagens personalizadas", () => {
  it("conta compras pequenas de hoje, da semana e do mês (fixas não entram)", async () => {
    const now = new Date("2026-10-16T15:00:00Z");
    const mk = (amount: number, date: string, desc: string) => createTransaction({ type: "EXPENSE", amount, description: desc, date, categoryId: s.food.id, status: "SETTLED", installments: 1, accountId: s.bank.id });
    await mk(1000, "2026-10-16", "a"); await mk(2500, "2026-10-16", "b"); await mk(9000, "2026-10-16", "grande"); await mk(2000, "2026-10-12", "c"); await mk(1500, "2026-10-02", "d");
    const st = await personalStats(now);
    expect(st.today).toEqual({ smallCount: 2, smallTotal: 3500 });
    expect(st.week).toEqual({ smallCount: 3, smallTotal: 5500 });
    expect(st.month.smallCount).toBe(4); expect(st.month.spent).toBe(16000);
    expect(st.topCategory?.name).toBe("Mercado");
  });
});
