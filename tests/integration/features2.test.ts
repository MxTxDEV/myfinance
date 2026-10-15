import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { resetDb, seedBasics } from "./helpers";
import { createTransaction, deleteTransaction } from "@/server/services/transactions";
import { accountBalances } from "@/server/services/accounts";
import { contribute, createInvestment, investmentsOverview, updateInvestmentValue, withdraw } from "@/server/services/investments";
import { netWorthOverview } from "@/server/services/planning";
import { monthSummary } from "@/server/services/reports";
import { endRecurring, fixedOverview, generateRecurring, updateRecurring } from "@/server/services/recurring";
import { ensureDailyMessage, sendDailyPush } from "@/server/services/daily";
import { GET as cronGET } from "@/app/api/cron/daily/route";
import webpush from "web-push";
import { d } from "@/domain/dates";

let s: Awaited<ReturnType<typeof seedBasics>>;
beforeEach(async () => { await resetDb(); s = await seedBasics(); });
const bal = async (id: string) => (await accountBalances()).find((a) => a.id === id)!.balance;
const base = () => ({ type: "EXPENSE" as const, amount: 5000, description: "Café", date: "2026-10-14", categoryId: s.food.id, accountId: s.bank.id, status: "SETTLED" as const, installments: 1 });

describe("fila offline: lançamentos idempotentes", () => {
  it("o mesmo clientId nunca duplica, nem em envios simultâneos", async () => {
    const clientId = randomUUID();
    await Promise.all([createTransaction({ ...base(), clientId }), createTransaction({ ...base(), clientId }), createTransaction({ ...base(), clientId })]);
    await createTransaction({ ...base(), clientId });
    expect(await prisma.transaction.count({ where: { clientId } })).toBe(1);
    expect(await bal(s.bank.id)).toBe(100000 - 5000);
  });
  it("clientId em compra parcelada fica só na primeira parcela", async () => {
    const clientId = randomUUID();
    await createTransaction({ ...base(), amount: 9000, accountId: undefined, cardId: s.card.id, installments: 3, clientId });
    await createTransaction({ ...base(), amount: 9000, accountId: undefined, cardId: s.card.id, installments: 3, clientId });
    expect(await prisma.transaction.count({ where: { cardId: s.card.id } })).toBe(3);
  });
});

describe("investimentos", () => {
  it("aporte sai da conta, não é despesa, e o patrimônio não conta duas vezes", async () => {
    const inv = await createInvestment({ name: "CDB", type: "FIXED_INCOME", initialValue: 0, date: "2026-10-01" });
    await contribute({ investmentId: inv.id, amount: 30000, date: "2026-10-02", accountId: s.bank.id });
    expect(await bal(s.bank.id)).toBe(70000);
    expect((await monthSummary("2026-10")).expense).toBe(0);
    const n = await netWorthOverview(d(2026, 10, 14));
    expect(n.net).toBe(70000 + 30000); // saldo + investimento = o mesmo patrimônio de antes
    expect(n.investmentTotal).toBe(30000);
  });
  it("valor atualizado gera rentabilidade; resgate devolve à conta sem virar receita", async () => {
    const inv = await createInvestment({ name: "Ações", type: "STOCKS", initialValue: 100000, date: "2026-09-01" });
    await updateInvestmentValue({ investmentId: inv.id, value: 112000, date: "2026-10-10" });
    let o = await investmentsOverview();
    expect(o.items[0]).toMatchObject({ value: 112000, contributed: 100000, totalReturn: 12000, returnPercent: 12 });
    await withdraw({ investmentId: inv.id, amount: 12000, date: "2026-10-11", accountId: s.bank.id });
    expect(await bal(s.bank.id)).toBe(112000);
    expect((await monthSummary("2026-10")).income).toBe(0);
    o = await investmentsOverview();
    expect(o.items[0]).toMatchObject({ value: 100000, withdrawn: 12000, totalReturn: 12000 });
    await expect(withdraw({ investmentId: inv.id, amount: 100001, date: "2026-10-12" })).rejects.toThrow(/maior/);
  });
  it("posição inicial não mexe em conta; excluir o aporte pelo extrato desfaz tudo", async () => {
    const inv = await createInvestment({ name: "Tesouro", type: "TREASURY", initialValue: 50000, date: "2026-10-01" });
    expect(await bal(s.bank.id)).toBe(100000);
    await contribute({ investmentId: inv.id, amount: 20000, date: "2026-10-02", accountId: s.bank.id });
    const t = await prisma.transaction.findFirstOrThrow({ where: { type: "INVESTMENT_OUT" } });
    await deleteTransaction(t.id);
    expect(await bal(s.bank.id)).toBe(100000);
    expect((await investmentsOverview()).items[0].value).toBe(50000);
    expect(await prisma.investmentEntry.count({ where: { investmentId: inv.id } })).toBe(1);
  });
  it("alocação por tipo soma 100%", async () => {
    await createInvestment({ name: "A", type: "STOCKS", initialValue: 75000, date: "2026-10-01" });
    await createInvestment({ name: "B", type: "CRYPTO", initialValue: 25000, date: "2026-10-01" });
    const o = await investmentsOverview();
    expect(o.allocation.map((a) => a.percent)).toEqual([75, 25]);
  });
});

describe("contas fixas", () => {
  it("repetir a partir do lançamento rápido cria o compromisso sem duplicar a 1ª ocorrência", async () => {
    await createTransaction({ ...base(), description: "Internet", amount: 10400, date: "2026-10-05", repeat: "MONTHLY" });
    await generateRecurring(d(2026, 10, 14));
    await generateRecurring(d(2026, 10, 14));
    const rows = await prisma.transaction.findMany({ where: { description: "Internet" }, orderBy: { date: "asc" } });
    expect(rows.map((r) => [r.date.toISOString().slice(0, 10), r.status])).toEqual([["2026-10-05", "SETTLED"], ["2026-11-05", "PLANNED"]]);
  });
  it("editar valor atualiza só as ocorrências futuras não pagas", async () => {
    await createTransaction({ ...base(), description: "Aluguel", amount: 100000, date: "2026-09-05", repeat: "MONTHLY" });
    await generateRecurring(d(2026, 10, 14));
    const rec = await prisma.recurringCommitment.findFirstOrThrow();
    await updateRecurring(rec.id, { amount: 110000 }, d(2026, 10, 14));
    const rows = await prisma.transaction.findMany({ where: { recurringId: rec.id }, orderBy: { date: "asc" } });
    expect(rows.map((r) => r.amount.toString())).toEqual(["1000", "1100", "1100"]); // 05/09 (pago) mantém 1000; 05/10 e 05/11 sobem
  });
  it("encerrar remove futuras previstas, preserva o pago e não gera mais", async () => {
    await createTransaction({ ...base(), description: "Academia", amount: 12000, date: "2026-10-01", repeat: "MONTHLY" });
    await generateRecurring(d(2026, 10, 14));
    const rec = await prisma.recurringCommitment.findFirstOrThrow();
    expect((await endRecurring(rec.id, d(2026, 10, 14))).removedOccurrences).toBe(1);
    await generateRecurring(d(2026, 12, 1));
    expect(await prisma.transaction.count({ where: { recurringId: rec.id, deletedAt: null } })).toBe(1);
  });
  it("painel do mês: previsto, pago, faltante, atrasado e peso na renda", async () => {
    await createTransaction({ type: "INCOME", amount: 500000, description: "Salário", date: "2026-10-01", categoryId: s.salary.id, accountId: s.bank.id, status: "SETTLED", installments: 1 });
    await createTransaction({ ...base(), description: "Aluguel", amount: 100000, date: "2026-10-05", repeat: "MONTHLY" }); // pago
    await createTransaction({ ...base(), description: "Luz", amount: 20000, date: "2026-10-10", status: "PLANNED", repeat: "MONTHLY" }); // atrasado
    const o = await fixedOverview("2026-10", d(2026, 10, 14));
    expect(o.totals).toMatchObject({ expected: 120000, paid: 100000, remaining: 20000, overdue: 20000, monthlyEquivalent: 120000, incomeShare: 24 });
  });
});

describe("mensagem das 06:00", () => {
  it("cria a mensagem do dia uma única vez", async () => {
    const now = new Date("2026-10-15T09:00:00Z");
    const a = await ensureDailyMessage(now), b = await ensureDailyMessage(now);
    expect(a.text).toBe(b.text);
    expect(await prisma.notification.count({ where: { type: "DAILY_MESSAGE" } })).toBe(1);
  });
  it("sem chaves VAPID, o envio é pulado sem erro", async () => {
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
    expect(await sendDailyPush(new Date("2026-10-15T09:00:00Z"))).toMatchObject({ sent: 0, skipped: "push-nao-configurado" });
  });
  it("com chaves VAPID, o envio das 06:00 acontece no máximo uma vez por dia (e limpa aparelhos mortos)", async () => {
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    const now = new Date("2026-10-15T09:00:00Z");
    expect(await sendDailyPush(now)).toMatchObject({ day: "2026-10-15", sent: 0 }); // sem aparelhos cadastrados
    expect(await sendDailyPush(now)).toMatchObject({ sent: 0, skipped: "ja-enviado" });
    expect(await prisma.pushDelivery.count()).toBe(1);
    // outro dia envia de novo
    expect((await sendDailyPush(new Date("2026-10-16T09:00:00Z"))).skipped).toBeUndefined();
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
  });
  it("a rota de cron só responde com o segredo correto", async () => {
    process.env.CRON_SECRET = "segredo-de-teste-1234567890";
    expect((await cronGET(new Request("http://x/api/cron/daily"))).status).toBe(401);
    expect((await cronGET(new Request("http://x/api/cron/daily", { headers: { authorization: "Bearer errado-errado-errado" } }))).status).toBe(401);
    const ok = await cronGET(new Request("http://x/api/cron/daily", { headers: { authorization: "Bearer segredo-de-teste-1234567890" } }));
    expect(ok.status).toBe(200);
    delete process.env.CRON_SECRET;
    expect((await cronGET(new Request("http://x/api/cron/daily?secret=qualquer"))).status).toBe(401); // sem segredo configurado: fechada
  });
});
