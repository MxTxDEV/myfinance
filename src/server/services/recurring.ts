import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { cents, dateIn, dateOut, dec } from "../convert";
import { DomainError } from "../errors";
import { recurringInput, recurringUpdate, type RecurringInput, type RecurringUpdate } from "../schemas";
import { ensureInvoice } from "./cards";
import { addDays, monthKey, monthRange, todayBR, type DateOnly } from "@/domain/dates";
import { monthlyEquivalent, occurrencesUntil } from "@/domain/recurrence";
import { percent } from "@/domain/money";

export async function createRecurring(raw: RecurringInput) {
  const v = recurringInput.parse(raw);
  if (v.recurrence === "CUSTOM" && !v.intervalDays) throw new DomainError("Informe o intervalo em dias");
  if (!v.accountId && !v.cardId) throw new DomainError("Escolha a conta ou o cartão");
  if (v.accountId && v.cardId) throw new DomainError("Escolha conta ou cartão, não ambos");
  if (v.cardId && v.type === "INCOME") throw new DomainError("Receita não pode ser no cartão");
  return prisma.recurringCommitment.create({
    data: { ...v, amount: dec(v.amount), startDate: dateIn(v.startDate), endDate: v.endDate ? dateIn(v.endDate) : null },
  });
}
export const setRecurringActive = (id: string, active: boolean) => prisma.recurringCommitment.update({ where: { id }, data: { active } });

/**
 * Gera as ocorrências vencidas ou dentro do horizonte (padrão: hoje + 35 dias) como PREVISTAS.
 * IDEMPOTENTE: a chave única (recurringId, occurrenceDate) impede duplicatas, mesmo em chamadas
 * concorrentes ou repetidas; ocorrências excluídas (soft delete) não são recriadas.
 */
export async function generateRecurring(today: DateOnly = todayBR(), horizonDays = 35) {
  const until = addDays(today, horizonDays);
  const items = await prisma.recurringCommitment.findMany({ where: { active: true } });
  let created = 0;
  for (const r of items) {
    const dates = occurrencesUntil({ start: r.startDate, kind: r.recurrence, intervalDays: r.intervalDays ?? undefined, endDate: r.endDate, until });
    if (dates.length === 0) continue;
    const existing = await prisma.transaction.findMany({ where: { recurringId: r.id }, select: { occurrenceDate: true } });
    const have = new Set(existing.map((e) => e.occurrenceDate!.getTime()));
    for (const when of dates) {
      if (have.has(when.getTime())) continue;
      try {
        await prisma.$transaction(async (tx) => {
          const card = r.cardId ? await tx.creditCard.findUnique({ where: { id: r.cardId } }) : null;
          const inv = card ? await ensureInvoice(tx, card, when) : null;
          await tx.transaction.create({
            data: {
              type: r.type, status: card ? "SETTLED" : "PLANNED", amount: dec(cents(r.amount)), description: r.description,
              date: when, dueDate: when, categoryId: r.categoryId, accountId: r.accountId, cardId: r.cardId,
              invoiceId: inv?.id, recurringId: r.id, occurrenceDate: when,
            },
          });
        });
        created++;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e; // outra chamada criou antes
      }
    }
  }
  return { created };
}

export async function listRecurring() {
  const rows = await prisma.recurringCommitment.findMany({ include: { category: true }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({
    id: r.id, description: r.description, type: r.type, amount: cents(r.amount), category: r.category.name, recurrence: r.recurrence,
    intervalDays: r.intervalDays, startDate: r.startDate.toISOString().slice(0, 10), active: r.active,
  }));
}

/**
 * Ocorrências ainda não realizadas. `includeOverdue`: ao REAJUSTAR, as previstas vencidas e não pagas
 * também recebem o novo valor; ao ENCERRAR, as vencidas permanecem (ainda podem estar em aberto).
 */
function futureOccurrences(id: string, today: DateOnly, includeOverdue = false) {
  return {
    recurringId: id, deletedAt: null,
    OR: [
      includeOverdue ? { status: "PLANNED" as const } : { status: "PLANNED" as const, date: { gte: today } },
      { cardId: { not: null }, date: { gt: today } },
    ],
  };
}

/**
 * Edita um compromisso e propaga para as ocorrências FUTURAS ainda não pagas.
 * O que já foi pago permanece como estava (histórico intacto).
 */
export async function updateRecurring(id: string, raw: RecurringUpdate, today: DateOnly = todayBR()) {
  const v = recurringUpdate.parse(raw);
  return prisma.$transaction(async (tx) => {
    const r = await tx.recurringCommitment.findUnique({ where: { id } });
    if (!r) throw new DomainError("Compromisso não encontrado");
    if (v.categoryId) {
      const c = await tx.category.findFirst({ where: { id: v.categoryId, type: r.type, archivedAt: null } });
      if (!c) throw new DomainError("Categoria inválida para este tipo");
    }
    if (v.accountId) {
      if (r.cardId) throw new DomainError("Este compromisso é no cartão");
      const a = await tx.account.findFirst({ where: { id: v.accountId, archivedAt: null } });
      if (!a) throw new DomainError("Conta não encontrada");
    }
    const updated = await tx.recurringCommitment.update({
      where: { id },
      data: {
        ...(v.description !== undefined ? { description: v.description } : {}),
        ...(v.amount !== undefined ? { amount: dec(v.amount) } : {}),
        ...(v.categoryId ? { categoryId: v.categoryId } : {}),
        ...(v.accountId ? { accountId: v.accountId } : {}),
        ...(v.endDate !== undefined ? { endDate: v.endDate ? dateIn(v.endDate) : null } : {}),
      },
    });
    await tx.transaction.updateMany({
      where: futureOccurrences(id, today, true),
      data: {
        ...(v.description !== undefined ? { description: v.description } : {}),
        ...(v.amount !== undefined ? { amount: dec(v.amount) } : {}),
        ...(v.categoryId ? { categoryId: v.categoryId } : {}),
        ...(v.accountId ? { accountId: v.accountId } : {}),
      },
    });
    if (v.endDate) await tx.transaction.updateMany({ where: { ...futureOccurrences(id, today), date: { gt: dateIn(v.endDate) } }, data: { deletedAt: new Date() } });
    return updated;
  });
}

/** Encerra o compromisso: nada mais será gerado e as ocorrências futuras não pagas somem. Histórico fica. */
export async function endRecurring(id: string, today: DateOnly = todayBR()) {
  return prisma.$transaction(async (tx) => {
    const r = await tx.recurringCommitment.findUnique({ where: { id } });
    if (!r) throw new DomainError("Compromisso não encontrado");
    await tx.recurringCommitment.update({ where: { id }, data: { active: false } });
    const gone = await tx.transaction.updateMany({ where: futureOccurrences(id, today), data: { deletedAt: new Date() } });
    return { removedOccurrences: gone.count };
  });
}

/**
 * Painel das contas fixas do mês: quanto está previsto, quanto já foi pago, quanto falta,
 * situação de cada compromisso e o peso na renda. Considera só despesas para os totais.
 */
export async function fixedOverview(key: string = monthKey(todayBR()), today: DateOnly = todayBR()) {
  const { start, end } = monthRange(key);
  const [recs, occ, incomeAgg] = await Promise.all([
    prisma.recurringCommitment.findMany({ include: { category: true }, orderBy: { createdAt: "asc" } }),
    prisma.transaction.findMany({ where: { deletedAt: null, recurringId: { not: null }, date: { gte: start, lte: end } }, orderBy: { date: "asc" } }),
    prisma.transaction.aggregate({ _sum: { amount: true }, where: { deletedAt: null, type: "INCOME", date: { gte: start, lte: end } } }),
  ]);
  const items = recs.map((r) => {
    const mine = occ.filter((o) => o.recurringId === r.id);
    const amount = cents(r.amount);
    const thisMonth = mine.map((o) => {
      const settled = o.status === "SETTLED";
      return { id: o.id, date: dateOut(o.date), amount: cents(o.amount), settled, overdue: !settled && o.date < today, isCard: o.cardId !== null };
    });
    return {
      id: r.id, description: r.description, type: r.type, amount, category: r.category.name, categoryId: r.categoryId,
      accountId: r.accountId, cardId: r.cardId, recurrence: r.recurrence, intervalDays: r.intervalDays, active: r.active,
      startDate: dateOut(r.startDate), endDate: r.endDate ? dateOut(r.endDate) : null,
      monthlyEquivalent: monthlyEquivalent(amount, r.recurrence, r.intervalDays ?? undefined), thisMonth,
    };
  });
  const expenseOcc = items.filter((i) => i.type === "EXPENSE").flatMap((i) => i.thisMonth);
  const expected = expenseOcc.reduce((s, o) => s + o.amount, 0);
  const paid = expenseOcc.filter((o) => o.settled).reduce((s, o) => s + o.amount, 0);
  const income = (incomeAgg._sum.amount ? cents(incomeAgg._sum.amount) : 0) + items.filter((i) => i.type === "INCOME").flatMap((i) => i.thisMonth).filter((o) => !o.settled).reduce((s, o) => s + o.amount, 0);
  return {
    month: key, items,
    totals: {
      expected, paid, remaining: expected - paid,
      overdue: expenseOcc.filter((o) => o.overdue).reduce((s, o) => s + o.amount, 0),
      monthlyEquivalent: items.filter((i) => i.type === "EXPENSE" && i.active).reduce((s, i) => s + i.monthlyEquivalent, 0),
      incomeShare: percent(expected, income),
    },
  };
}
