import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { cents, dateIn, dateOut } from "../convert";

export interface LedgerFilters {
  q?: string; from?: string; to?: string; categoryId?: string; accountId?: string; cardId?: string;
  type?: "INCOME" | "EXPENSE" | "TRANSFER"; status?: "PLANNED" | "SETTLED";
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc"; page?: number;
}
export const PAGE_SIZE = 50;

function where(f: LedgerFilters): Prisma.TransactionWhereInput {
  const types = f.type === "TRANSFER" ? ["TRANSFER_IN", "TRANSFER_OUT"] : f.type ? [f.type] : undefined;
  return {
    deletedAt: null,
    // Transferências: mostra só a perna de saída para não duplicar o item no feed (a entrada fica no detalhe).
    NOT: { type: "TRANSFER_IN" },
    ...(types ? { type: { in: types as Prisma.EnumTransactionTypeFilter["in"] } } : {}),
    ...(f.q ? { description: { contains: f.q, mode: "insensitive" } } : {}),
    ...(f.from || f.to ? { date: { ...(f.from ? { gte: dateIn(f.from) } : {}), ...(f.to ? { lte: dateIn(f.to) } : {}) } } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.accountId ? { OR: [{ accountId: f.accountId }, { transfer: { toAccountId: f.accountId } }] } : {}),
    ...(f.cardId ? { cardId: f.cardId } : {}),
    ...(f.status ? { status: f.status } : {}),
  };
}

const ORDER: Record<NonNullable<LedgerFilters["sort"]>, Prisma.TransactionOrderByWithRelationInput[]> = {
  date_desc: [{ date: "desc" }, { createdAt: "desc" }],
  date_asc: [{ date: "asc" }, { createdAt: "asc" }],
  amount_desc: [{ amount: "desc" }, { date: "desc" }],
  amount_asc: [{ amount: "asc" }, { date: "desc" }],
};

export async function listTransactions(f: LedgerFilters = {}) {
  const w = where(f);
  const page = Math.max(0, f.page ?? 0);
  const [rows, total, inc, exp] = await Promise.all([
    prisma.transaction.findMany({
      where: w, orderBy: ORDER[f.sort ?? "date_desc"], skip: page * PAGE_SIZE, take: PAGE_SIZE + 1,
      include: { category: true, account: true, card: true, transfer: { include: { fromAccount: true, toAccount: true } } },
    }),
    prisma.transaction.count({ where: w }),
    prisma.transaction.aggregate({ _sum: { amount: true }, where: { AND: [w, { type: "INCOME" }] } }),
    prisma.transaction.aggregate({ _sum: { amount: true }, where: { AND: [w, { type: "EXPENSE" }] } }),
  ]);
  const hasMore = rows.length > PAGE_SIZE;
  return {
    total, hasMore, page,
    totals: { income: inc._sum.amount ? cents(inc._sum.amount) : 0, expense: exp._sum.amount ? cents(exp._sum.amount) : 0 },
    items: rows.slice(0, PAGE_SIZE).map((t) => ({
      id: t.id, type: t.type, status: t.status, amount: cents(t.amount), description: t.description, date: dateOut(t.date),
      categoryId: t.categoryId, categoryName: t.category?.name ?? null, categoryIcon: t.category?.icon ?? null,
      accountName: t.type === "TRANSFER_OUT" && t.transfer ? `${t.transfer.fromAccount.name} → ${t.transfer.toAccount.name}` : t.card?.name ?? t.account?.name ?? null,
      cardId: t.cardId, accountId: t.accountId, installment: t.planId ? `${t.installmentNumber}` : null,
      notes: t.notes, payerSource: t.payerSource, dueDate: t.dueDate ? dateOut(t.dueDate) : null, transferId: t.transferId,
    })),
  };
}
export type LedgerItem = Awaited<ReturnType<typeof listTransactions>>["items"][number];

/** Sugestões: descrições frequentes e a categoria mais usada para cada uma. */
export async function suggestions(type: "INCOME" | "EXPENSE") {
  const rows = await prisma.transaction.groupBy({
    by: ["description", "categoryId"], where: { deletedAt: null, type, planId: null },
    _count: { _all: true }, orderBy: { _count: { description: "desc" } }, take: 60,
  });
  const best = new Map<string, { categoryId: string | null; n: number }>();
  for (const r of rows) {
    const k = r.description.toLowerCase();
    if (!best.has(k) || best.get(k)!.n < r._count._all) best.set(k, { categoryId: r.categoryId, n: r._count._all });
  }
  return [...best].slice(0, 30).map(([k, v]) => ({ description: rows.find((r) => r.description.toLowerCase() === k)!.description, categoryId: v.categoryId }));
}
