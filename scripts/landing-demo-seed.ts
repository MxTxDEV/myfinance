// Dados 100% FICTÍCIOS para gerar as capturas da landing page (scripts/landing-shots.mjs). Nunca roda em produção:
// só aceita um banco chamado finance_os_demo.
import { prismaRaw, prisma, runAs } from "../src/server/db";
import { createUser } from "../src/server/services/users";
import { createTransaction } from "../src/server/services/transactions";
import { createCard, payInvoice, setInvoiceBases, cardTimeline } from "../src/server/services/cards";
import { createDebt, createGoal, addGoalEntry, upsertBudget } from "../src/server/services/planning";
import { contribute, createInvestment, updateInvestmentValue } from "../src/server/services/investments";
import { addFixedExpense, savePlanPrefs } from "../src/server/services/plan";
import { addDays, d, iso, todayBR } from "../src/domain/dates";
import { pushPrefsSchema } from "../src/server/push-prefs";

async function main() {
  if (!/finance_os_demo/.test(process.env.DATABASE_URL ?? "")) throw new Error("Use somente o banco finance_os_demo");
  const today = todayBR();
  const user = await createUser({ name: "Ana Demo", email: "demo@example.com", password: "demo-senha-segura-1" });
  await runAs(user.id, async () => {
    const cat = async (name: string) => (await prisma.category.findFirstOrThrow({ where: { name } })).id;
    const acc = await prisma.account.create({ data: { name: "Conta Corrente", institution: "Banco Exemplo", type: "CHECKING", initialBalance: "2400.00", initialBalanceDate: new Date(`${iso(addDays(today, -75))}T00:00:00Z`) } });
    const sav = await prisma.account.create({ data: { name: "Reserva", institution: "Banco Exemplo", type: "SAVINGS", initialBalance: "6500.00", initialBalanceDate: new Date(`${iso(addDays(today, -75))}T00:00:00Z`) } });
    const roxo = await createCard({ name: "Cartão Roxo", limit: 800000, closingDay: 10, dueDay: 17, payAccountId: acc.id, monthlyRate: 12, color: "#7C3AED" });
    const ouro = await createCard({ name: "Cartão Ouro", limit: 450000, closingDay: 25, dueDay: 5, payAccountId: acc.id, monthlyRate: 11, color: "#D4A017" });

    const inc = async (amount: number, daysAgo: number, desc: string, c: string) =>
      createTransaction({ type: "INCOME", amount, description: desc, date: iso(addDays(today, -daysAgo)), categoryId: await cat(c), status: "SETTLED", installments: 1, accountId: acc.id });
    const exp = async (amount: number, daysAgo: number, desc: string, c: string, target: { accountId?: string; cardId?: string }, installments = 1) =>
      createTransaction({ type: "EXPENSE", amount, description: desc, date: iso(addDays(today, -daysAgo)), categoryId: await cat(c), status: "SETTLED", installments, ...target });

    for (const m of [0, 1, 2]) await inc(620000, m * 30 + 9, "Salário (exemplo)", "Salário");
    await inc(85000, 12, "Projeto avulso (exemplo)", "Renda extra");
    const mk = [["Mercado Exemplo", 18900], ["Padaria Exemplo", 2350], ["Mercado Exemplo", 24780], ["Feira Exemplo", 6120]] as const;
    let i = 1;
    for (const [n, v] of mk) await exp(v, i++ * 4, n, "Mercado", { cardId: roxo.id });
    await exp(1890, 1, "Café Exemplo", "Alimentação", { cardId: roxo.id });
    await exp(3290, 2, "Delivery Exemplo", "Alimentação", { cardId: roxo.id });
    await exp(1250, 2, "Transporte por app", "Transporte", { cardId: roxo.id });
    await exp(2790, 3, "Cinema Exemplo", "Lazer", { cardId: ouro.id });
    await exp(4590, 5, "Streaming Exemplo", "Assinaturas", { cardId: ouro.id });
    await exp(32990, 6, "Fone Exemplo", "Tecnologia", { cardId: ouro.id }, 3);
    await exp(14500, 8, "Farmácia Exemplo", "Saúde", { accountId: acc.id });
    await exp(9800, 10, "Combustível Exemplo", "Combustível", { accountId: acc.id });
    await exp(1590, 0, "Padaria Exemplo", "Alimentação", { accountId: acc.id });

    await addFixedExpense({ description: "Aluguel (exemplo)", amount: 185000, day: 5, accountId: acc.id }, today);
    await addFixedExpense({ description: "Internet (exemplo)", amount: 12990, day: 12, accountId: acc.id }, today);
    await addFixedExpense({ description: "Academia (exemplo)", amount: 11900, day: 20, cardId: roxo.id }, today);

    for (const c of [roxo, ouro]) {
      const tl = await cardTimeline(c.id, today, 6);
      await setInvoiceBases(c.id, c === roxo
        ? [{ referenceMonth: tl[0].referenceMonth, amount: 96000 }, { referenceMonth: tl[1].referenceMonth, amount: 41000 }, { referenceMonth: tl[2].referenceMonth, amount: 28000 }, { referenceMonth: tl[3].referenceMonth, amount: 28000 }]
        : [{ referenceMonth: tl[0].referenceMonth, amount: 54000 }, { referenceMonth: tl[1].referenceMonth, amount: 22000 }]);
    }
    // A fatura mais antiga do Cartão Roxo já foi paga (para a demonstração não mostrar atraso).
    const first = (await cardTimeline(roxo.id, today, 1))[0];
    if (first.invoiceId && first.remaining > 0) await payInvoice({ invoiceId: first.invoiceId, amount: first.remaining, date: iso(addDays(today, -1)) });
    await createDebt({ name: "Financiamento do carro (exemplo)", originalAmount: 3600000, balance: 2450000, monthlyRate: 1.6, installmentAmount: 98000, installmentsTotal: 48, kind: "VEICULO", nextDueDate: iso(addDays(today, 9)) });
    await createDebt({ name: "Empréstimo pessoal (exemplo)", originalAmount: 800000, balance: 520000, monthlyRate: 3.1, installmentAmount: 41000, kind: "EMPRESTIMO" });

    await upsertBudget({ categoryId: await cat("Mercado"), limit: 90000, alertAt: [50, 80, 100] });
    await upsertBudget({ categoryId: await cat("Alimentação"), limit: 40000, alertAt: [50, 80, 100] });
    await upsertBudget({ categoryId: await cat("Lazer"), limit: 30000, alertAt: [50, 80, 100] });
    const reserva = await createGoal({ name: "Reserva de emergência", targetAmount: 3000000, targetDate: iso(addDays(today, 540)), priority: 1, accountId: sav.id });
    await addGoalEntry({ goalId: reserva.id, amount: 1250000, date: iso(addDays(today, -40)) });
    const viagem = await createGoal({ name: "Viagem de férias", targetAmount: 650000, targetDate: iso(addDays(today, 300)), priority: 2 });
    await addGoalEntry({ goalId: viagem.id, amount: 180000, date: iso(addDays(today, -20)) });
    const rf = await createInvestment({ name: "Renda fixa (exemplo)", type: "FIXED_INCOME", institution: "Banco Exemplo", initialValue: 1200000, date: iso(addDays(today, -90)) });
    await updateInvestmentValue({ investmentId: rf.id, value: 1268000, date: iso(addDays(today, -2)) });
    const tes = await createInvestment({ name: "Tesouro (exemplo)", type: "TREASURY", institution: "Corretora Exemplo", initialValue: 800000, date: iso(addDays(today, -80)) });
    await contribute({ investmentId: tes.id, amount: 50000, date: iso(addDays(today, -15)), accountId: acc.id });
    await updateInvestmentValue({ investmentId: tes.id, value: 872000, date: iso(addDays(today, -2)) });
    await savePlanPrefs(user.id, { income: 620000, variable: null, strategy: "AVALANCHE" });
    await prismaRaw.profile.update({ where: { id: user.id }, data: { notifyPrefs: { menu: pushPrefsSchema.parse({ ...pushPrefsSchema.shape, enabled: true, morning: true, perDay: 6, windowStart: "06:00", windowEnd: "22:00", minGapMinutes: 60, spend: true, invest: true, motivation: true, personal: true, emojis: true, alerts: { bills: true, invoices: true, debts: true, budget: false, goals: false, monthlySummary: true, wins: true }, stages: [3, 1, 0] }) } } }).catch(() => undefined);
  });
  void d;
  console.log("Demo pronto: demo@example.com");
}
main().finally(() => prismaRaw.$disconnect());
