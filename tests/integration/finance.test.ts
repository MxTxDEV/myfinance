import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetDb, seedBasics } from "./helpers";
import { createTransaction, deleteTransaction, duplicateTransaction, settleTransaction, updateTransaction } from "@/server/services/transactions";
import { createTransfer, deleteTransfer, updateTransfer } from "@/server/services/transfers";
import { accountBalances } from "@/server/services/accounts";
import { cardOverview, invoiceViews, payInvoice } from "@/server/services/cards";
import { createRecurring, generateRecurring } from "@/server/services/recurring";
import { dashboard, monthSummary } from "@/server/services/reports";
import { d } from "@/domain/dates";

let s: Awaited<ReturnType<typeof seedBasics>>;
beforeEach(async () => { await resetDb(); s = await seedBasics(); });

const bal = async (id: string) => (await accountBalances()).find((a) => a.id === id)!.balance;

describe("receitas e despesas", () => {
  it("cria receita e despesa e atualiza o saldo", async () => {
    await createTransaction({ type: "INCOME", amount: 460000, description: "Salário", date: "2026-10-05", categoryId: s.salary.id, accountId: s.bank.id, status: "SETTLED", installments: 1 });
    await createTransaction({ type: "EXPENSE", amount: 8650, description: "Mercado", date: "2026-10-13", categoryId: s.food.id, accountId: s.bank.id, status: "SETTLED", installments: 1 });
    expect(await bal(s.bank.id)).toBe(100000 + 460000 - 8650);
  });
  it("previstas não alteram o saldo real até serem efetivadas", async () => {
    const [t] = await createTransaction({ type: "INCOME", amount: 50000, description: "Freela", date: "2026-10-20", categoryId: s.salary.id, accountId: s.bank.id, status: "PLANNED", installments: 1 });
    expect(await bal(s.bank.id)).toBe(100000);
    await settleTransaction(t.id);
    expect(await bal(s.bank.id)).toBe(150000);
  });
  it("rejeita categoria de tipo errado e valor inválido", async () => {
    await expect(createTransaction({ type: "EXPENSE", amount: 100, description: "x", date: "2026-10-01", categoryId: s.salary.id, accountId: s.bank.id, status: "SETTLED", installments: 1 })).rejects.toThrow(/categoria/i);
    await expect(createTransaction({ type: "EXPENSE", amount: 0, description: "x", date: "2026-10-01", categoryId: s.food.id, accountId: s.bank.id, status: "SETTLED", installments: 1 })).rejects.toThrow();
    await expect(createTransaction({ type: "EXPENSE", amount: 1.5, description: "x", date: "2026-10-01", categoryId: s.food.id, accountId: s.bank.id, status: "SETTLED", installments: 1 })).rejects.toThrow();
  });
  it("edita, duplica e exclui (soft delete) refletindo no saldo", async () => {
    const [t] = await createTransaction({ type: "EXPENSE", amount: 10000, description: "Academia", date: "2026-10-02", categoryId: s.food.id, accountId: s.bank.id, status: "SETTLED", installments: 1 });
    expect(await bal(s.bank.id)).toBe(90000);
    await updateTransaction(t.id, { amount: 12000 });
    expect(await bal(s.bank.id)).toBe(88000);
    const [dup] = await duplicateTransaction(t.id, "2026-11-02");
    expect(dup.id).not.toBe(t.id);
    expect(await bal(s.bank.id)).toBe(76000);
    await deleteTransaction(t.id);
    expect(await bal(s.bank.id)).toBe(88000);
    const row = await prisma.transaction.findUnique({ where: { id: t.id } });
    expect(row?.deletedAt).not.toBeNull();
  });
});

describe("transferências", () => {
  it("move dinheiro entre contas sem virar receita/despesa", async () => {
    await createTransfer({ fromAccountId: s.bank.id, toAccountId: s.bank2.id, amount: 30000, date: "2026-10-10" });
    expect(await bal(s.bank.id)).toBe(70000);
    expect(await bal(s.bank2.id)).toBe(30000);
    const sum = await monthSummary("2026-10");
    expect(sum.income).toBe(0);
    expect(sum.expense).toBe(0);
    expect(await prisma.transaction.count({ where: { type: { in: ["TRANSFER_IN", "TRANSFER_OUT"] } } })).toBe(2);
  });
  it("edição e exclusão mantêm as duas pernas consistentes", async () => {
    const tr = await createTransfer({ fromAccountId: s.bank.id, toAccountId: s.bank2.id, amount: 30000, date: "2026-10-10" });
    await updateTransfer(tr.id, { fromAccountId: s.bank.id, toAccountId: s.bank2.id, amount: 45000, date: "2026-10-11" });
    expect(await bal(s.bank.id)).toBe(55000);
    expect(await bal(s.bank2.id)).toBe(45000);
    await deleteTransfer(tr.id);
    expect(await bal(s.bank.id)).toBe(100000);
    expect(await bal(s.bank2.id)).toBe(0);
  });
  it("excluir uma perna pela movimentação remove a transferência inteira", async () => {
    await createTransfer({ fromAccountId: s.bank.id, toAccountId: s.bank2.id, amount: 30000, date: "2026-10-10" });
    const leg = await prisma.transaction.findFirstOrThrow({ where: { type: "TRANSFER_IN" } });
    await deleteTransaction(leg.id);
    expect(await bal(s.bank.id)).toBe(100000);
    expect(await bal(s.bank2.id)).toBe(0);
  });
  it("rejeita transferência para a mesma conta", async () => {
    await expect(createTransfer({ fromAccountId: s.bank.id, toAccountId: s.bank.id, amount: 100, date: "2026-10-10" })).rejects.toThrow();
  });
});

describe("cartão de crédito", () => {
  it("compra consome limite mas não mexe no saldo bancário", async () => {
    await createTransaction({ type: "EXPENSE", amount: 100000, description: "TV", date: "2026-10-05", categoryId: s.food.id, cardId: s.card.id, status: "SETTLED", installments: 1 });
    expect(await bal(s.bank.id)).toBe(100000);
    const [c] = await cardOverview(d(2026, 10, 6));
    expect(c.used).toBe(100000);
    expect(c.available).toBe(400000);
    expect(c.currentInvoice?.referenceMonth).toBe("2026-10");
  });
  it("compras antes e depois do fechamento caem em faturas diferentes", async () => {
    await createTransaction({ type: "EXPENSE", amount: 1000, description: "a", date: "2026-10-10", categoryId: s.food.id, cardId: s.card.id, status: "SETTLED", installments: 1 });
    await createTransaction({ type: "EXPENSE", amount: 2000, description: "b", date: "2026-10-11", categoryId: s.food.id, cardId: s.card.id, status: "SETTLED", installments: 1 });
    const inv = await invoiceViews(s.card.id, d(2026, 10, 12));
    expect(inv.map((i) => [i.referenceMonth, i.total])).toEqual([["2026-10", 1000], ["2026-11", 2000]]);
  });
  it("parcelamento gera parcelas nas faturas certas e soma exata", async () => {
    await createTransaction({ type: "EXPENSE", amount: 10000, description: "Notebook", date: "2026-10-05", categoryId: s.food.id, cardId: s.card.id, status: "SETTLED", installments: 3 });
    const inv = await invoiceViews(s.card.id, d(2026, 10, 6));
    expect(inv.map((i) => [i.referenceMonth, i.total])).toEqual([["2026-10", 3334], ["2026-11", 3333], ["2026-12", 3333]]);
    expect(inv.reduce((a, i) => a + i.total, 0)).toBe(10000);
    const [c] = await cardOverview(d(2026, 10, 6));
    expect(c.used).toBe(10000); // parcelas futuras consomem limite
    const txs = await prisma.transaction.findMany({ where: { cardId: s.card.id }, orderBy: { date: "asc" } });
    expect(txs.map((t) => t.description)).toEqual(["Notebook (1/3)", "Notebook (2/3)", "Notebook (3/3)"]);
  });
  it("pagamento integral: sai da conta, libera limite e não duplica despesa", async () => {
    await createTransaction({ type: "EXPENSE", amount: 20000, description: "Compra", date: "2026-10-05", categoryId: s.food.id, cardId: s.card.id, status: "SETTLED", installments: 1 });
    const [inv] = await invoiceViews(s.card.id, d(2026, 10, 12));
    await payInvoice({ invoiceId: inv.id, amount: 20000, date: "2026-10-17" });
    expect(await bal(s.bank.id)).toBe(80000);
    const [c] = await cardOverview(d(2026, 10, 18));
    expect(c.used).toBe(0);
    expect(c.invoices[0].status).toBe("PAID");
    const sum = await monthSummary("2026-10");
    expect(sum.expense).toBe(20000); // contada uma única vez
  });
  it("pagamento parcial mantém saldo devedor e rejeita excesso", async () => {
    await createTransaction({ type: "EXPENSE", amount: 20000, description: "Compra", date: "2026-10-05", categoryId: s.food.id, cardId: s.card.id, status: "SETTLED", installments: 1 });
    const [inv] = await invoiceViews(s.card.id, d(2026, 10, 12));
    await payInvoice({ invoiceId: inv.id, amount: 5000, date: "2026-10-17" });
    await payInvoice({ invoiceId: inv.id, amount: 5000, date: "2026-10-17" });
    const [after] = await invoiceViews(s.card.id, d(2026, 10, 12));
    expect(after.paid).toBe(10000);
    expect(after.remaining).toBe(10000);
    expect(after.status).toBe("PARTIAL");
    expect(await bal(s.bank.id)).toBe(90000);
    await expect(payInvoice({ invoiceId: inv.id, amount: 10001, date: "2026-10-17" })).rejects.toThrow(/maior/);
  });
  it("excluir compra parcelada remove todas as parcelas e devolve o limite", async () => {
    const [first] = await createTransaction({ type: "EXPENSE", amount: 9000, description: "X", date: "2026-10-05", categoryId: s.food.id, cardId: s.card.id, status: "SETTLED", installments: 3 });
    expect((await deleteTransaction(first.id)).deleted).toBe(3);
    expect((await cardOverview(d(2026, 10, 6)))[0].used).toBe(0);
  });
  it("não permite conta e cartão juntos, nem parcelar sem cartão", async () => {
    await expect(createTransaction({ type: "EXPENSE", amount: 100, description: "x", date: "2026-10-01", categoryId: s.food.id, cardId: s.card.id, accountId: s.bank.id, status: "SETTLED", installments: 1 })).rejects.toThrow();
    await expect(createTransaction({ type: "EXPENSE", amount: 100, description: "x", date: "2026-10-01", categoryId: s.food.id, accountId: s.bank.id, status: "SETTLED", installments: 2 })).rejects.toThrow();
  });
});

describe("recorrências", () => {
  it("gerar várias vezes não duplica (idempotente), inclusive em paralelo", async () => {
    await createRecurring({ description: "Internet", type: "EXPENSE", amount: 10400, categoryId: s.food.id, accountId: s.bank.id, recurrence: "MONTHLY", startDate: "2026-08-05" });
    const today = d(2026, 10, 14);
    await Promise.all([generateRecurring(today), generateRecurring(today), generateRecurring(today)]);
    await generateRecurring(today);
    const rows = await prisma.transaction.findMany({ where: { description: "Internet" }, orderBy: { date: "asc" } });
    expect(rows.map((r) => r.date.toISOString().slice(0, 10))).toEqual(["2026-08-05", "2026-09-05", "2026-10-05", "2026-11-05"]);
    expect(rows.every((r) => r.status === "PLANNED")).toBe(true);
    expect(await bal(s.bank.id)).toBe(100000); // previstas não afetam o saldo
  });
  it("ocorrência excluída não é recriada", async () => {
    await createRecurring({ description: "Assinatura", type: "EXPENSE", amount: 3000, categoryId: s.food.id, accountId: s.bank.id, recurrence: "MONTHLY", startDate: "2026-10-01" });
    await generateRecurring(d(2026, 10, 14));
    const t = await prisma.transaction.findFirstOrThrow({ where: { description: "Assinatura" }, orderBy: { date: "asc" } });
    await deleteTransaction(t.id);
    await generateRecurring(d(2026, 10, 14));
    expect(await prisma.transaction.count({ where: { description: "Assinatura", date: new Date("2026-10-01"), deletedAt: null } })).toBe(0);
    expect(await prisma.transaction.count({ where: { description: "Assinatura" } })).toBe(2); // outubro (excluída) + novembro
  });
});

describe("resumo e painel", () => {
  it("resumo mensal e taxa de poupança", async () => {
    await createTransaction({ type: "INCOME", amount: 500000, description: "Salário", date: "2026-10-05", categoryId: s.salary.id, accountId: s.bank.id, status: "SETTLED", installments: 1 });
    await createTransaction({ type: "EXPENSE", amount: 100000, description: "Aluguel", date: "2026-10-06", categoryId: s.food.id, accountId: s.bank.id, status: "SETTLED", installments: 1 });
    const m = await monthSummary("2026-10");
    expect(m).toMatchObject({ income: 500000, expense: 100000, result: 400000, savingsRate: 80 });
    expect((await monthSummary("2026-09")).savingsRate).toBeNull();
  });
  it("saldo disponível separa fatura pendente e nunca soma limite", async () => {
    await createTransaction({ type: "EXPENSE", amount: 30000, description: "Compra", date: "2026-10-05", categoryId: s.food.id, cardId: s.card.id, status: "SETTLED", installments: 1 });
    const dsh = await dashboard(d(2026, 10, 14));
    expect(dsh.available).toBe(100000);
    expect(dsh.pendingInvoices).toBe(30000);
    expect(dsh.projected).toBe(70000);
  });
});
