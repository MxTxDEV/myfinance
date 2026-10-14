import { prisma, type Tx } from "../db";
import { cents, dateIn, dec } from "../convert";
import { DomainError } from "../errors";
import { transactionInput, transactionUpdate, type TransactionInput, type TransactionUpdate } from "../schemas";
import { ensureInvoice } from "./cards";
import { addMonths } from "@/domain/dates";
import { splitInstallments } from "@/domain/money";

async function requireCategory(tx: Tx, id: string, type: "INCOME" | "EXPENSE") {
  const c = await tx.category.findFirst({ where: { id, archivedAt: null } });
  if (!c) throw new DomainError("Categoria não encontrada");
  if (c.type !== type) throw new DomainError("A categoria não corresponde ao tipo da movimentação");
}

/**
 * Cria receita/despesa. Regras:
 * - Receita/despesa PREVISTA não altera saldo (o saldo só soma SETTLED).
 * - Compra no cartão: sem conta, vinculada à fatura; consome limite, não reduz saldo.
 * - Parcelado: uma transação por parcela, cada uma na fatura correta, soma = total.
 */
export async function createTransaction(raw: TransactionInput) {
  const v = transactionInput.parse(raw);
  const date = dateIn(v.date);
  return prisma.$transaction(async (tx) => {
    await requireCategory(tx, v.categoryId, v.type);
    const base = {
      type: v.type, categoryId: v.categoryId, payerSource: v.payerSource, notes: v.notes, attachmentUrl: v.attachmentUrl,
      dueDate: v.dueDate ? dateIn(v.dueDate) : undefined,
    };
    if (v.cardId) {
      const card = await tx.creditCard.findFirst({ where: { id: v.cardId, archivedAt: null } });
      if (!card) throw new DomainError("Cartão não encontrado");
      const parts = splitInstallments(v.amount, v.installments);
      const plan = v.installments > 1
        ? await tx.installmentPlan.create({ data: { cardId: card.id, description: v.description, totalAmount: dec(v.amount), count: v.installments, purchaseDate: date } })
        : null;
      const created = [];
      for (let i = 0; i < parts.length; i++) {
        const when = addMonths(date, i);
        const inv = await ensureInvoice(tx, card, when);
        created.push(await tx.transaction.create({
          data: {
            ...base, status: "SETTLED", settledAt: new Date(), amount: dec(parts[i]), date: when,
            description: plan ? `${v.description} (${i + 1}/${v.installments})` : v.description,
            cardId: card.id, invoiceId: inv.id, planId: plan?.id, installmentNumber: plan ? i + 1 : undefined,
          },
        }));
      }
      return created;
    }
    const acc = await tx.account.findFirst({ where: { id: v.accountId!, archivedAt: null } });
    if (!acc) throw new DomainError("Conta não encontrada");
    return [await tx.transaction.create({
      data: {
        ...base, status: v.status, settledAt: v.status === "SETTLED" ? new Date() : null, amount: dec(v.amount), date,
        description: v.description, accountId: acc.id,
      },
    })];
  });
}

/** Marca uma movimentação prevista como recebida/paga. */
export async function settleTransaction(id: string, opts: { date?: string; accountId?: string } = {}) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.transaction.findFirst({ where: { id, deletedAt: null } });
    if (!t) throw new DomainError("Movimentação não encontrada");
    if (t.status === "SETTLED") return t;
    const accountId = opts.accountId ?? t.accountId;
    if (!accountId) throw new DomainError("Informe a conta para efetivar");
    return tx.transaction.update({
      where: { id }, data: { status: "SETTLED", settledAt: new Date(), accountId, ...(opts.date ? { date: dateIn(opts.date) } : {}) },
    });
  });
}

const LOCKED = ["TRANSFER_IN", "TRANSFER_OUT", "INVOICE_PAYMENT", "DEBT_PAYMENT"];

export async function updateTransaction(id: string, raw: TransactionUpdate) {
  const v = transactionUpdate.parse(raw);
  return prisma.$transaction(async (tx) => {
    const t = await tx.transaction.findFirst({ where: { id, deletedAt: null } });
    if (!t) throw new DomainError("Movimentação não encontrada");
    if (LOCKED.includes(t.type)) throw new DomainError("Edite transferências e pagamentos pela própria operação");
    if (v.categoryId) await requireCategory(tx, v.categoryId, t.type as "INCOME" | "EXPENSE");
    if (t.planId && (v.amount !== undefined || v.date !== undefined))
      throw new DomainError("Para alterar valor ou data de uma compra parcelada, exclua e recadastre o parcelamento");
    if (t.cardId && v.accountId) throw new DomainError("Compra no cartão não tem conta");
    if (v.accountId) {
      const acc = await tx.account.findFirst({ where: { id: v.accountId, archivedAt: null } });
      if (!acc) throw new DomainError("Conta não encontrada");
    }
    let invoiceId = t.invoiceId;
    if (t.cardId && v.date) {
      const card = await tx.creditCard.findUniqueOrThrow({ where: { id: t.cardId } });
      invoiceId = (await ensureInvoice(tx, card, dateIn(v.date))).id;
    }
    return tx.transaction.update({
      where: { id },
      data: {
        ...(v.amount !== undefined ? { amount: dec(v.amount) } : {}),
        ...(v.description !== undefined ? { description: v.description } : {}),
        ...(v.date ? { date: dateIn(v.date) } : {}),
        ...(v.categoryId ? { categoryId: v.categoryId } : {}),
        ...(v.accountId ? { accountId: v.accountId } : {}),
        ...(v.dueDate !== undefined ? { dueDate: v.dueDate ? dateIn(v.dueDate) : null } : {}),
        ...(v.payerSource !== undefined ? { payerSource: v.payerSource } : {}),
        ...(v.notes !== undefined ? { notes: v.notes } : {}),
        invoiceId,
      },
    });
  });
}

/**
 * Exclusão lógica. Transferência remove as duas pernas; compra parcelada remove todas as parcelas.
 * Pagamento de fatura excluído volta a deixar a fatura em aberto.
 */
export async function deleteTransaction(id: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.transaction.findFirst({ where: { id, deletedAt: null } });
    if (!t) throw new DomainError("Movimentação não encontrada");
    const now = new Date();
    if (t.transferId) {
      await tx.transaction.updateMany({ where: { transferId: t.transferId }, data: { deletedAt: now } });
      await tx.transfer.update({ where: { id: t.transferId }, data: { deletedAt: now } });
      return { deleted: 2 };
    }
    if (t.planId) {
      const r = await tx.transaction.updateMany({ where: { planId: t.planId, deletedAt: null }, data: { deletedAt: now } });
      return { deleted: r.count };
    }
    await tx.transaction.update({ where: { id }, data: { deletedAt: now } });
    return { deleted: 1 };
  });
}

/** Duplica uma movimentação com data de hoje (ou informada), como nova movimentação independente. */
export async function duplicateTransaction(id: string, date: string) {
  const t = await prisma.transaction.findFirst({ where: { id, deletedAt: null } });
  if (!t) throw new DomainError("Movimentação não encontrada");
  if (LOCKED.includes(t.type) || !t.categoryId) throw new DomainError("Este tipo de movimentação não pode ser duplicado");
  return createTransaction({
    type: t.type as "INCOME" | "EXPENSE", amount: cents(t.amount), description: t.description.replace(/ \(\d+\/\d+\)$/, ""),
    date, categoryId: t.categoryId, status: t.status,
    accountId: t.accountId ?? undefined, cardId: t.cardId ?? undefined, installments: 1,
    payerSource: t.payerSource ?? undefined, notes: t.notes ?? undefined,
  });
}
