import { beforeEach, describe, expect, it } from "vitest";
import { __setTestUser, prisma, prismaRaw } from "@/server/db";
import { resetDb, seedBasics, makeUser } from "./helpers";
import { cardOverview, cardTimeline, payInvoice, setInvoiceBases } from "@/server/services/cards";
import { createTransaction } from "@/server/services/transactions";
import { accountBalances } from "@/server/services/accounts";
import { monthSummary } from "@/server/services/reports";
import { listTransactions } from "@/server/services/ledger";
import { financialPlan } from "@/server/services/plan";
import { d } from "@/domain/dates";

let s: Awaited<ReturnType<typeof seedBasics>>;
const TODAY = d(2026, 10, 16); // cartão fecha dia 10 e vence dia 17: a fatura que recebe compras hoje fecha em 10/11
beforeEach(async () => { await resetDb(); s = await seedBasics(); });

const purchase = (amount: number, date: string, installments = 1) =>
  createTransaction({ type: "EXPENSE", amount, description: "Compra", date, categoryId: s.food.id, status: "SETTLED", installments, cardId: s.card.id });

describe("saldo informado das faturas do cartão", () => {
  it("atual, próxima e as seguintes; o usado do limite soma tudo", async () => {
    const tl = await cardTimeline(s.card.id, TODAY, 6);
    expect(tl).toHaveLength(6);
    expect(tl[0].referenceMonth).toBe("2026-11");
    await setInvoiceBases(s.card.id, [
      { referenceMonth: tl[0].referenceMonth, amount: 120000 }, // fatura atual
      { referenceMonth: tl[1].referenceMonth, amount: 80000 }, // próxima
      { referenceMonth: tl[2].referenceMonth, amount: 30000 }, // parcelas dos meses seguintes
      { referenceMonth: tl[3].referenceMonth, amount: 30000 },
    ]);
    const after = await cardTimeline(s.card.id, TODAY, 6);
    expect(after.map((i) => i.total)).toEqual([120000, 80000, 30000, 30000, 0, 0]);
    expect(after[0].base).toBe(120000); expect(after[0].purchases).toBe(0);
    const [c] = await cardOverview(TODAY);
    expect(c.used).toBe(260000); // 100% do que já está comprometido no cartão
    expect(c.available).toBe(500000 - 260000);
  });

  it("compra nova entra sozinha por cima: sobe a fatura, o usado e a dívida", async () => {
    const tl = await cardTimeline(s.card.id, TODAY, 3);
    await setInvoiceBases(s.card.id, [{ referenceMonth: tl[0].referenceMonth, amount: 100000 }]);
    await purchase(25000, "2026-10-20");
    const after = await cardTimeline(s.card.id, TODAY, 3);
    expect(after[0].total).toBe(125000); expect(after[0].base).toBe(100000); expect(after[0].purchases).toBe(25000);
    expect((await cardOverview(TODAY))[0].used).toBe(125000);
    // parcelado em 3x: cada parcela cai numa fatura (a 1ª nesta)
    await purchase(30000, "2026-10-21", 3);
    const t2 = await cardTimeline(s.card.id, TODAY, 4);
    expect(t2.slice(0, 3).map((i) => i.purchases)).toEqual([35000, 10000, 10000]);
  });

  it("refazer substitui (idempotente), zero remove, e pagar reduz o que falta", async () => {
    const ref = (await cardTimeline(s.card.id, TODAY, 2))[0].referenceMonth;
    await setInvoiceBases(s.card.id, [{ referenceMonth: ref, amount: 90000 }]);
    await setInvoiceBases(s.card.id, [{ referenceMonth: ref, amount: 90000 }]);
    await setInvoiceBases(s.card.id, [{ referenceMonth: ref, amount: 100000 }]);
    expect(await prisma.transaction.count({ where: { type: "CARD_BALANCE" } })).toBe(1);
    expect((await cardTimeline(s.card.id, TODAY, 1))[0].total).toBe(100000);
    const inv = (await cardTimeline(s.card.id, TODAY, 1))[0].invoiceId!;
    await payInvoice({ invoiceId: inv, amount: 40000, date: "2026-10-30" });
    const t = (await cardTimeline(s.card.id, TODAY, 1))[0];
    expect(t.remaining).toBe(60000); expect(t.paid).toBe(40000);
    await setInvoiceBases(s.card.id, [{ referenceMonth: ref, amount: 0 }]);
    expect(await prisma.transaction.count({ where: { type: "CARD_BALANCE" } })).toBe(0);
  });

  it("não é gasto do mês, não aparece em Movimentações e não mexe no saldo das contas", async () => {
    const before = (await accountBalances()).reduce((x, a) => x + a.balance, 0);
    const ref = (await cardTimeline(s.card.id, TODAY, 1))[0].referenceMonth;
    await setInvoiceBases(s.card.id, [{ referenceMonth: ref, amount: 700000 }]);
    expect((await accountBalances()).reduce((x, a) => x + a.balance, 0)).toBe(before);
    expect((await monthSummary("2026-11")).expense).toBe(0);
    expect((await listTransactions({})).items.filter((i) => i.type === "CARD_BALANCE")).toHaveLength(0);
  });

  it("recusa mês fora do período, valor inválido e cartão de outro usuário", async () => {
    await expect(setInvoiceBases(s.card.id, [{ referenceMonth: "2030-01", amount: 1000 }])).rejects.toThrow(/fora do período/);
    await expect(setInvoiceBases(s.card.id, [{ referenceMonth: "2026-11", amount: -5 }])).rejects.toThrow(/inválidos/);
    await makeUser("b@example.com");
    await expect(setInvoiceBases(s.card.id, [{ referenceMonth: "2026-11", amount: 1000 }])).rejects.toThrow(/não encontrado/);
    __setTestUser((await prismaRaw.profile.findFirstOrThrow({ orderBy: { createdAt: "asc" } })).id);
  });

  it("o cartão entra sozinho no plano de dívidas: saldo = usado, parcela do mês = fatura mais antiga em aberto", async () => {
    const tl = await cardTimeline(s.card.id, TODAY, 3);
    await setInvoiceBases(s.card.id, [{ referenceMonth: tl[0].referenceMonth, amount: 100000 }, { referenceMonth: tl[1].referenceMonth, amount: 60000 }]);
    await prisma.creditCard.update({ where: { id: s.card.id }, data: { monthlyRate: "10" } });
    const p = await financialPlan({ income: 800000 }, TODAY);
    const cd = p.debts.find((x) => x.auto)!;
    expect(cd.balance).toBe(160000); expect(cd.minPayment).toBe(100000); expect(cd.monthlyRate).toBe(10);
    expect(p.totalDebt).toBe(160000);
    expect(p.result.months).not.toBeNull();
    // compra nova sobe a dívida automaticamente
    await purchase(40000, "2026-10-25");
    expect((await financialPlan({ income: 800000 }, TODAY)).totalDebt).toBe(200000);
  });
});
