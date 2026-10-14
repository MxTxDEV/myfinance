import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { cents, dateIn, dec } from "../convert";
import { DomainError } from "../errors";
import { recurringInput, type RecurringInput } from "../schemas";
import { ensureInvoice } from "./cards";
import { addDays, todayBR, type DateOnly } from "@/domain/dates";
import { occurrencesUntil } from "@/domain/recurrence";

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
