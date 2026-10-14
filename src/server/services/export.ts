import { prisma } from "../db";
import { cents, dateOut } from "../convert";
import { toDecimalString } from "@/domain/money";

/** Neutraliza injeção de fórmulas em planilhas e escapa CSV. */
function cell(v: string | null | undefined): string {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function transactionsCsv(): Promise<string> {
  const rows = await prisma.transaction.findMany({
    where: { deletedAt: null }, orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: { category: true, account: true, card: true },
  });
  const head = ["data", "tipo", "situacao", "descricao", "categoria", "conta", "cartao", "valor_brl", "observacoes"];
  const lines = rows.map((t) => [
    dateOut(t.date), t.type, t.status, t.description, t.category?.name, t.account?.name, t.card?.name,
    toDecimalString(cents(t.amount)).replace(".", ","), t.notes,
  ].map((x) => cell(x as string | null)).join(";"));
  return "﻿" + [head.join(";"), ...lines].join("\r\n"); // BOM + ';' para abrir direto no Excel pt-BR
}

/** Exportação integral dos dados pessoais (exceto o hash de senha). */
export async function exportAll() {
  const [accounts, categories, transactions, transfers, cards, invoices, plans, recurring, budgets, goals, goalEntries, debts, assets] = await Promise.all([
    prisma.account.findMany(), prisma.category.findMany(), prisma.transaction.findMany(), prisma.transfer.findMany(),
    prisma.creditCard.findMany(), prisma.invoice.findMany(), prisma.installmentPlan.findMany(), prisma.recurringCommitment.findMany(),
    prisma.budget.findMany(), prisma.goal.findMany(), prisma.goalEntry.findMany(), prisma.debt.findMany(), prisma.asset.findMany(),
  ]);
  return { exportedAt: new Date().toISOString(), currency: "BRL", accounts, categories, transactions, transfers, cards, invoices, plans, recurring, budgets, goals, goalEntries, debts, assets };
}
