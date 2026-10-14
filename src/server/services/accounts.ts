import { prisma, type Db } from "../db";
import { cents, dateIn, dateOut, dec } from "../convert";
import { DomainError } from "../errors";
import { accountInput, type AccountInput } from "../schemas";
import type { Cents } from "@/domain/money";

/** Efeito no saldo: + para entradas, − para saídas de caixa. */
export const SIGN = { INCOME: 1, TRANSFER_IN: 1, EXPENSE: -1, TRANSFER_OUT: -1, INVOICE_PAYMENT: -1, DEBT_PAYMENT: -1 } as const;

/** Saldo atual por conta = saldo inicial + movimentações EFETIVADAS (previstas nunca contam). */
export async function accountBalances(db: Db = prisma, onlyActive = true) {
  const accounts = await db.account.findMany({ where: onlyActive ? { archivedAt: null } : {}, orderBy: { createdAt: "asc" } });
  const rows = await db.transaction.findMany({
    where: { deletedAt: null, status: "SETTLED", accountId: { in: accounts.map((a) => a.id) } },
    select: { accountId: true, type: true, amount: true, date: true },
  });
  return accounts.map((a) => {
    let balance = cents(a.initialBalance);
    for (const t of rows) {
      if (t.accountId !== a.id || t.date < a.initialBalanceDate) continue;
      balance += SIGN[t.type] * cents(t.amount);
    }
    return {
      id: a.id, name: a.name, institution: a.institution, type: a.type, color: a.color, icon: a.icon,
      initialBalance: cents(a.initialBalance), initialBalanceDate: dateOut(a.initialBalanceDate),
      archived: a.archivedAt !== null, balance: balance as Cents,
    };
  });
}

export async function createAccount(raw: AccountInput) {
  const v = accountInput.parse(raw);
  return prisma.account.create({
    data: { ...v, initialBalance: dec(v.initialBalance), initialBalanceDate: dateIn(v.initialBalanceDate) },
  });
}

export async function updateAccount(id: string, raw: Partial<AccountInput>) {
  const v = accountInput.partial().parse(raw);
  const { initialBalance, initialBalanceDate, ...rest } = v;
  return prisma.account.update({
    where: { id },
    data: {
      ...rest,
      ...(initialBalance !== undefined ? { initialBalance: dec(initialBalance) } : {}),
      ...(initialBalanceDate ? { initialBalanceDate: dateIn(initialBalanceDate) } : {}),
    },
  });
}

/** Arquivar preserva o histórico. Não permite arquivar conta que paga um cartão ativo. */
export async function archiveAccount(id: string) {
  const cards = await prisma.creditCard.count({ where: { payAccountId: id, archivedAt: null } });
  if (cards > 0) throw new DomainError("Esta conta paga a fatura de um cartão ativo. Troque a conta do cartão primeiro.");
  return prisma.account.update({ where: { id }, data: { archivedAt: new Date() } });
}
export const unarchiveAccount = (id: string) => prisma.account.update({ where: { id }, data: { archivedAt: null } });
