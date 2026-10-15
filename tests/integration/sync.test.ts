import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetDb, seedBasics } from "./helpers";
import { commitStatement, previewStatement } from "@/server/services/statements";
import { createTransaction } from "@/server/services/transactions";
import { createTransfer } from "@/server/services/transfers";
import { accountBalances } from "@/server/services/accounts";
import { cardOverview, invoiceViews, payInvoice } from "@/server/services/cards";
import { budgetOverview, createAsset, createDebt, createGoal, addGoalEntry, goalsOverview, netWorthOverview, payDebt, upsertBudget } from "@/server/services/planning";
import { contribute, createInvestment, updateInvestmentValue, withdraw, investmentsOverview } from "@/server/services/investments";
import { monthSummary } from "@/server/services/reports";
import { d } from "@/domain/dates";

let s: Awaited<ReturnType<typeof seedBasics>>;
beforeEach(async () => { await resetDb(); s = await seedBasics(); });
const bal = async (id: string) => (await accountBalances()).find((a) => a.id === id)!.balance;
const TODAY = d(2026, 10, 20);

const OFX = `<OFX><STMTTRN><DTPOSTED>20261013<TRNAMT>-86.50<FITID>F1<MEMO>COMPRA NO DEBITO MERCADO SAO JOAO 123</STMTTRN>
<STMTTRN><DTPOSTED>20261005<TRNAMT>4600.00<FITID>F2<MEMO>SALARIO EMPRESA X</STMTTRN>
<STMTTRN><DTPOSTED>20261017<TRNAMT>-350.00<FITID>F3<MEMO>PAGAMENTO FATURA CARTAO ROXO</STMTTRN></OFX>`;

describe("importar extrato da conta", () => {
  it("sugere categoria pelo histórico, desmarca pagamento de fatura e grava o resto no saldo/relatórios", async () => {
    await createTransaction({ type: "EXPENSE", amount: 5000, description: "Mercado São João", date: "2026-09-01", categoryId: s.food.id, accountId: s.bank.id, status: "SETTLED", installments: 1 });
    const p = await previewStatement({ text: OFX, kind: "account", targetId: s.bank.id });
    expect(p.rows).toHaveLength(3);
    const mercado = p.rows.find((r) => r.key === "id:F1")!;
    expect(mercado).toMatchObject({ type: "EXPENSE", amount: 8650, categoryId: s.food.id, skip: false }); // aprendeu "mercado são joão"
    expect(p.rows.find((r) => r.key === "id:F2")).toMatchObject({ type: "INCOME", amount: 460000, categoryId: null });
    expect(p.rows.find((r) => r.key === "id:F3")).toMatchObject({ skip: true, note: expect.stringContaining("fatura") });

    const chosen = p.rows.filter((r) => !r.skip).map((r) => ({ ...r, categoryId: r.categoryId ?? s.salary.id }));
    const r1 = await commitStatement({ kind: "account", targetId: s.bank.id, rows: chosen });
    expect(r1).toMatchObject({ created: 2, skipped: 0, errors: [] });
    expect(await bal(s.bank.id)).toBe(100000 - 5000 + 460000 - 8650);
    const m = await monthSummary("2026-10");
    expect(m).toMatchObject({ income: 460000, expense: 8650 });
  });
  it("importar o mesmo arquivo de novo não duplica nada", async () => {
    const p = await previewStatement({ text: OFX, kind: "account", targetId: s.bank.id });
    const rows = p.rows.filter((r) => !r.skip).map((r) => ({ ...r, categoryId: s.food.id }));
    await commitStatement({ kind: "account", targetId: s.bank.id, rows: rows.filter((r) => r.type === "EXPENSE") });
    const again = await commitStatement({ kind: "account", targetId: s.bank.id, rows: rows.filter((r) => r.type === "EXPENSE") });
    expect(again).toMatchObject({ created: 0, skipped: 1 });
    const p2 = await previewStatement({ text: OFX, kind: "account", targetId: s.bank.id });
    expect(p2.rows.find((r) => r.key === "id:F1")).toMatchObject({ duplicate: "exact", skip: true });
    expect(await prisma.transaction.count({ where: { importKey: { not: null } } })).toBe(1);
  });
  it("marca como provável duplicado o que você já lançou à mão (mesmo valor, ±1 dia)", async () => {
    await createTransaction({ type: "EXPENSE", amount: 8650, description: "Mercado", date: "2026-10-14", categoryId: s.food.id, accountId: s.bank.id, status: "SETTLED", installments: 1 });
    const p = await previewStatement({ text: OFX, kind: "account", targetId: s.bank.id });
    expect(p.rows.find((r) => r.key === "id:F1")).toMatchObject({ duplicate: "maybe", skip: true });
  });
  it("CSV sem identificador: linhas repetidas continuam sendo duas e reimportar não duplica", async () => {
    const csv = `Data;Descrição;Valor\n14/10/2026;CAFE;-12,00\n14/10/2026;CAFE;-12,00`;
    const p = await previewStatement({ text: csv, kind: "account", targetId: s.bank.id });
    const rows = p.rows.map((r) => ({ ...r, categoryId: s.food.id }));
    expect((await commitStatement({ kind: "account", targetId: s.bank.id, rows })).created).toBe(2);
    expect((await commitStatement({ kind: "account", targetId: s.bank.id, rows })).created).toBe(0);
    expect(await bal(s.bank.id)).toBe(100000 - 2400);
  });
  it("arquivo ilegível é recusado com mensagem clara", async () => {
    const p = await previewStatement({ text: "a;b\n1;2", kind: "account", targetId: s.bank.id });
    expect(p.rows).toHaveLength(0); expect(p.warnings[0]).toMatch(/colunas/);
    await expect(previewStatement({ text: OFX, kind: "account", targetId: "naoexiste" })).rejects.toThrow(/não encontrada/);
  });
});

describe("importar PDF", () => {
  const PDF = `%%PDFTEXT%%\nSALDO ANTERIOR 1.000,00\n05/10/2026 SALARIO EMPRESA 4.600,00 5.600,00\n13/10/2026 MERCADO SAO JOAO 86,50 5.513,50\n14/10/2026 DEPOSITO RECEBIDO 300,00\n15/10/2026 XYZ COMERCIO 20,00`;
  it("conta: o saldo confirma entrada/saída; o que ficou sem sinal é sugerido pelas palavras e marcado para conferência", async () => {
    const p = await previewStatement({ text: PDF, kind: "account", targetId: s.bank.id });
    expect(p.format).toBe("pdf");
    expect(p.rows.map((r) => [r.description, r.type, r.amount, r.uncertain])).toEqual([
      ["SALARIO EMPRESA", "INCOME", 460000, false], ["MERCADO SAO JOAO", "EXPENSE", 8650, false],
      ["DEPOSITO RECEBIDO", "INCOME", 30000, true], ["XYZ COMERCIO", "EXPENSE", 2000, true],
    ]);
    expect(p.rows[2].note).toMatch(/confira/i);
  });
  it("fatura em PDF: valores sem sinal são compras; crédito/pagamento fica de fora; reimportar não duplica", async () => {
    const fatura = `%%PDFTEXT%%\n05 OUT NETFLIX 55,90\n11 OUT PADARIA 35,90\n14 OUT PAGAMENTO RECEBIDO -91,80\nEmitido em 20/10/2026`;
    const p = await previewStatement({ text: fatura, kind: "card", targetId: s.card.id });
    expect(p.rows.filter((r) => !r.skip).map((r) => r.description)).toEqual(["NETFLIX", "PADARIA"]);
    expect(p.rows.every((r) => r.type === "EXPENSE")).toBe(true);
    const rows = p.rows.filter((r) => !r.skip).map((r) => ({ ...r, categoryId: s.food.id }));
    expect((await commitStatement({ kind: "card", targetId: s.card.id, rows })).created).toBe(2);
    const again = await previewStatement({ text: fatura, kind: "card", targetId: s.card.id });
    expect(again.rows.filter((r) => r.duplicate === "exact")).toHaveLength(2);
  });
});

describe("importar fatura do cartão", () => {
  const CSV = `Data,Valor,Identificador,Descrição\n05/10/2026,120.00,c1,Netflix\n11/10/2026,35.90,c2,Padaria\n12/10/2026,-155.90,c3,Pagamento recebido`;
  it("compras viram despesas no cartão (consomem limite, não mexem no saldo) e pagamento/estorno fica de fora", async () => {
    const p = await previewStatement({ text: CSV, kind: "card", targetId: s.card.id });
    expect(p.rows.filter((r) => r.skip).map((r) => r.key)).toEqual(["id:c3"]);
    const rows = p.rows.filter((r) => !r.skip).map((r) => ({ ...r, categoryId: s.food.id }));
    expect((await commitStatement({ kind: "card", targetId: s.card.id, rows })).created).toBe(2);
    expect(await bal(s.bank.id)).toBe(100000);
    const [c] = await cardOverview(TODAY);
    expect(c.used).toBe(15590);
    const inv = await invoiceViews(s.card.id, TODAY);
    expect(inv.map((i) => [i.referenceMonth, i.total])).toEqual([["2026-10", 12000], ["2026-11", 3590]]); // fecha dia 10: 05/10 entra em outubro; 11/10 em novembro
    expect((await monthSummary("2026-10")).expense).toBe(15590); // compras entram nos relatórios
  });
  it("cartão com compras em valores negativos também é entendido", async () => {
    const neg = `Data;Descrição;Valor\n05/10/2026;LOJA;-80,00\n06/10/2026;OUTRA;-20,00\n07/10/2026;ESTORNO;10,00`;
    const p = await previewStatement({ text: neg, kind: "card", targetId: s.card.id });
    expect(p.rows.filter((r) => !r.skip)).toHaveLength(2);
    expect(p.rows.find((r) => r.description === "ESTORNO")!.skip).toBe(true);
  });
});

describe("tudo sincronizado: o patrimônio obedece à conservação", () => {
  // Δ patrimônio = receitas − despesas (+ valorização manual). Movimentos internos (transferência, aporte, resgate,
  // pagamento de fatura, pagamento de dívida, reserva de meta) NÃO podem mudar o patrimônio.
  it("uma sequência de operações de todos os módulos deixa o patrimônio exatamente onde deve", async () => {
    await createAsset({ name: "Carro", type: "VEHICLE", value: 3000000, valueUpdatedAt: "2026-10-01" });
    const debt = await createDebt({ name: "Financiamento", originalAmount: 500000, balance: 300000, installmentAmount: 50000 });
    const inv = await createInvestment({ name: "CDB", type: "FIXED_INCOME", initialValue: 20000, date: "2026-10-01" });
    const goal = await createGoal({ name: "Reserva", targetAmount: 100000, priority: 1 });
    await upsertBudget({ categoryId: s.food.id, limit: 100000, alertAt: [80] });
    const before = (await netWorthOverview(TODAY)).net;

    await createTransaction({ type: "INCOME", amount: 500000, description: "Salário", date: "2026-10-05", categoryId: s.salary.id, accountId: s.bank.id, status: "SETTLED", installments: 1 }); // +5000
    await createTransaction({ type: "EXPENSE", amount: 100000, description: "TV", date: "2026-10-06", categoryId: s.food.id, cardId: s.card.id, status: "SETTLED", installments: 2 }); // −1000 (2 parcelas)
    await createTransaction({ type: "EXPENSE", amount: 20000, description: "Mercado", date: "2026-10-07", categoryId: s.food.id, accountId: s.bank.id, status: "SETTLED", installments: 1 }); // −200
    await createTransfer({ fromAccountId: s.bank.id, toAccountId: s.bank2.id, amount: 30000, date: "2026-10-08" }); // interno
    await contribute({ investmentId: inv.id, amount: 40000, date: "2026-10-09", accountId: s.bank.id }); // interno
    await withdraw({ investmentId: inv.id, amount: 10000, date: "2026-10-10", accountId: s.bank2.id }); // interno
    await payDebt({ debtId: debt.id, amount: 50000, date: "2026-10-11", accountId: s.bank.id }); // interno (caixa ↓, dívida ↓)
    await addGoalEntry({ goalId: goal.id, amount: 25000, date: "2026-10-12" }); // reserva interna
    const [firstInvoice] = await invoiceViews(s.card.id, TODAY);
    await payInvoice({ invoiceId: firstInvoice.id, amount: firstInvoice.total, date: "2026-10-17" }); // interno

    const after = (await netWorthOverview(TODAY)).net;
    expect(after - before).toBe(500000 - 100000 - 20000);

    // Cada módulo enxerga o mesmo fato:
    const m = await monthSummary("2026-10");
    // Competência por parcela: em outubro entram a 1ª parcela da TV (R$ 500) + mercado (R$ 200); a 2ª parcela cai em novembro.
    expect(m).toMatchObject({ income: 500000, expense: 70000, result: 430000 });
    expect((await budgetOverview("2026-10")).items[0].spent).toBe(70000); // orçamento vê o mesmo valor
    expect((await monthSummary("2026-11")).expense).toBe(50000);
    expect((await goalsOverview(TODAY)).items[0].saved).toBe(25000);
    expect((await investmentsOverview()).items[0]).toMatchObject({ value: 20000 + 40000 - 10000, contributed: 60000, withdrawn: 10000 });
    expect((await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } })).balance.toString()).toBe("2500");
    const [c] = await cardOverview(TODAY);
    expect(c.used).toBe(100000 - firstInvoice.total); // só o que falta pagar consome limite
  });
  it("valorização de investimento e de bem muda o patrimônio na mesma proporção", async () => {
    const inv = await createInvestment({ name: "Ações", type: "STOCKS", initialValue: 100000, date: "2026-10-01" });
    const before = (await netWorthOverview(TODAY)).net;
    await updateInvestmentValue({ investmentId: inv.id, value: 118000, date: "2026-10-15" });
    expect((await netWorthOverview(TODAY)).net - before).toBe(18000);
  });
});
