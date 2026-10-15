import { prisma } from "../db";
import { cents, dateIn, dateOut, dec } from "../convert";
import { DomainError } from "../errors";
import { investmentInput, investmentMoveInput, investmentValueInput, type InvestmentInput, type InvestmentMoveInput } from "../schemas";
import type { z } from "zod";
import { investmentSummary } from "@/domain/planning";
import { percent } from "@/domain/money";

/** Cria o investimento. `initialValue` é uma posição que você já tinha: entra como aporte SEM mexer em nenhuma conta. */
export async function createInvestment(raw: InvestmentInput) {
  const v = investmentInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const inv = await tx.investment.create({
      data: { name: v.name, type: v.type, institution: v.institution, currentValue: dec(v.initialValue), valueUpdatedAt: dateIn(v.date) },
    });
    if (v.initialValue > 0) {
      await tx.investmentEntry.create({ data: { investmentId: inv.id, kind: "CONTRIBUTION", amount: dec(v.initialValue), date: dateIn(v.date), note: "Posição inicial" } });
    }
    return inv;
  });
}

async function activeInvestment(tx: Pick<typeof prisma, "investment">, id: string) {
  const inv = await tx.investment.findFirst({ where: { id, archivedAt: null } });
  if (!inv) throw new DomainError("Investimento não encontrado");
  return inv;
}

/**
 * Aporte. Com conta: sai da conta (INVESTMENT_OUT) e o valor do investimento sobe — não é despesa.
 * Sem conta: apenas registra o aumento da posição (dinheiro que já estava fora do app).
 */
export async function contribute(raw: InvestmentMoveInput) {
  const v = investmentMoveInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const inv = await activeInvestment(tx, v.investmentId);
    let transactionId: string | undefined;
    if (v.accountId) {
      const acc = await tx.account.findFirst({ where: { id: v.accountId, archivedAt: null } });
      if (!acc) throw new DomainError("Conta não encontrada");
      const t = await tx.transaction.create({
        data: { type: "INVESTMENT_OUT", status: "SETTLED", settledAt: new Date(), amount: dec(v.amount), date: dateIn(v.date), description: `Aporte: ${inv.name}`, accountId: v.accountId, investmentId: inv.id },
      });
      transactionId = t.id;
    }
    await tx.investmentEntry.create({ data: { investmentId: inv.id, kind: "CONTRIBUTION", amount: dec(v.amount), date: dateIn(v.date), note: v.note, transactionId } });
    return tx.investment.update({ where: { id: inv.id }, data: { currentValue: dec(cents(inv.currentValue) + v.amount) } });
  });
}

/** Resgate: não pode passar do valor atual. Com conta, o dinheiro entra nela (INVESTMENT_IN) — não é receita. */
export async function withdraw(raw: InvestmentMoveInput) {
  const v = investmentMoveInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const inv = await activeInvestment(tx, v.investmentId);
    const current = cents(inv.currentValue);
    if (v.amount > current) throw new DomainError("O resgate é maior que o valor atual do investimento");
    let transactionId: string | undefined;
    if (v.accountId) {
      const acc = await tx.account.findFirst({ where: { id: v.accountId, archivedAt: null } });
      if (!acc) throw new DomainError("Conta não encontrada");
      const t = await tx.transaction.create({
        data: { type: "INVESTMENT_IN", status: "SETTLED", settledAt: new Date(), amount: dec(v.amount), date: dateIn(v.date), description: `Resgate: ${inv.name}`, accountId: v.accountId, investmentId: inv.id },
      });
      transactionId = t.id;
    }
    await tx.investmentEntry.create({ data: { investmentId: inv.id, kind: "WITHDRAWAL", amount: dec(v.amount), date: dateIn(v.date), note: v.note, transactionId } });
    return tx.investment.update({ where: { id: inv.id }, data: { currentValue: dec(current - v.amount) } });
  });
}

/** Informa o valor de mercado atual (você atualiza manualmente; sem cotação automática). */
export async function updateInvestmentValue(raw: z.input<typeof investmentValueInput>) {
  const v = investmentValueInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const inv = await activeInvestment(tx, v.investmentId);
    await tx.investmentEntry.create({ data: { investmentId: inv.id, kind: "VALUE_UPDATE", amount: dec(v.value), date: dateIn(v.date) } });
    return tx.investment.update({ where: { id: inv.id }, data: { currentValue: dec(v.value), valueUpdatedAt: dateIn(v.date) } });
  });
}

export const archiveInvestment = (id: string) => prisma.investment.update({ where: { id }, data: { archivedAt: new Date() } });

export async function investmentsOverview() {
  const rows = await prisma.investment.findMany({ where: { archivedAt: null }, include: { entries: { orderBy: { date: "asc" } } }, orderBy: { createdAt: "asc" } });
  const items = rows.map((r) => {
    const contributed = r.entries.filter((e) => e.kind === "CONTRIBUTION").reduce((s, e) => s + cents(e.amount), 0);
    const withdrawn = r.entries.filter((e) => e.kind === "WITHDRAWAL").reduce((s, e) => s + cents(e.amount), 0);
    const value = cents(r.currentValue);
    return {
      id: r.id, name: r.name, type: r.type, institution: r.institution, value, valueUpdatedAt: dateOut(r.valueUpdatedAt),
      contributed, withdrawn, ...investmentSummary({ contributed, withdrawn, currentValue: value }),
      history: r.entries.slice(-6).map((e) => ({ kind: e.kind, amount: cents(e.amount), date: dateOut(e.date), note: e.note })),
    };
  });
  const total = items.reduce((s, i) => s + i.value, 0);
  const totalContributed = items.reduce((s, i) => s + i.contributed, 0);
  const totalReturn = items.reduce((s, i) => s + i.totalReturn, 0);
  const byType = new Map<string, number>();
  for (const i of items) byType.set(i.type, (byType.get(i.type) ?? 0) + i.value);
  return {
    items, total, totalReturn, returnPercent: percent(totalReturn, totalContributed),
    allocation: [...byType].map(([type, value]) => ({ type, value, percent: percent(value, total) })).sort((a, b) => b.value - a.value),
  };
}
