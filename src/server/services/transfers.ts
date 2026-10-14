import { prisma, type Db } from "../db";
import { dateIn, dec } from "../convert";
import { DomainError } from "../errors";
import { transferInput, type TransferInput } from "../schemas";

async function activeAccounts(tx: Db, ids: string[]) {
  const n = await tx.account.count({ where: { id: { in: ids }, archivedAt: null } });
  if (n !== ids.length) throw new DomainError("Conta não encontrada ou arquivada");
}

/** Transferência = 1 operação + 2 lançamentos (saída/entrada), nunca receita nem despesa. */
export async function createTransfer(raw: TransferInput) {
  const v = transferInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    await activeAccounts(tx, [v.fromAccountId, v.toAccountId]);
    const description = v.description || "Transferência";
    const tr = await tx.transfer.create({
      data: { fromAccountId: v.fromAccountId, toAccountId: v.toAccountId, amount: dec(v.amount), date: dateIn(v.date), description },
    });
    const common = { status: "SETTLED" as const, settledAt: new Date(), amount: dec(v.amount), date: dateIn(v.date), description, transferId: tr.id };
    await tx.transaction.create({ data: { ...common, type: "TRANSFER_OUT", accountId: v.fromAccountId } });
    await tx.transaction.create({ data: { ...common, type: "TRANSFER_IN", accountId: v.toAccountId } });
    return tr;
  });
}

export async function updateTransfer(id: string, raw: TransferInput) {
  const v = transferInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const tr = await tx.transfer.findFirst({ where: { id, deletedAt: null } });
    if (!tr) throw new DomainError("Transferência não encontrada");
    await activeAccounts(tx, [v.fromAccountId, v.toAccountId]);
    const description = v.description || "Transferência";
    const common = { amount: dec(v.amount), date: dateIn(v.date), description };
    await tx.transfer.update({ where: { id }, data: { ...common, fromAccountId: v.fromAccountId, toAccountId: v.toAccountId } });
    await tx.transaction.updateMany({ where: { transferId: id, type: "TRANSFER_OUT" }, data: { ...common, accountId: v.fromAccountId } });
    await tx.transaction.updateMany({ where: { transferId: id, type: "TRANSFER_IN" }, data: { ...common, accountId: v.toAccountId } });
    return tx.transfer.findUniqueOrThrow({ where: { id } });
  });
}

export async function deleteTransfer(id: string) {
  return prisma.$transaction(async (tx) => {
    const tr = await tx.transfer.findFirst({ where: { id, deletedAt: null } });
    if (!tr) throw new DomainError("Transferência não encontrada");
    const now = new Date();
    await tx.transaction.updateMany({ where: { transferId: id }, data: { deletedAt: now } });
    await tx.transfer.update({ where: { id }, data: { deletedAt: now } });
  });
}
