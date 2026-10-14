import { addMonths, clampDay, d, monthKey, type DateOnly } from "./dates";

export interface InvoiceCycle {
  referenceMonth: string; // mês em que a fatura fecha, "YYYY-MM"
  closingDate: DateOnly;
  dueDate: DateOnly;
}

/** Fatura que fecha no mês (y,m) para um cartão. */
export function cycleForClosingMonth(y: number, m: number, closingDay: number, dueDay: number): InvoiceCycle {
  const closingDate = clampDay(y, m, closingDay);
  // Vencimento: primeiro `dueDay` estritamente depois do fechamento.
  let due = clampDay(y, m, dueDay);
  if (due.getTime() <= closingDate.getTime()) {
    const next = addMonths(d(y, m, 1), 1);
    due = clampDay(next.getUTCFullYear(), next.getUTCMonth() + 1, dueDay);
  }
  return { referenceMonth: `${y}-${String(m).padStart(2, "0")}`, closingDate, dueDate: due };
}

/**
 * Em qual fatura cai uma compra feita em `purchase`?
 * Regra: compra até o dia de fechamento (inclusive) entra na fatura que fecha neste mês;
 * depois do fechamento, entra na fatura do mês seguinte.
 */
export function invoiceForPurchase(purchase: DateOnly, closingDay: number, dueDay: number): InvoiceCycle {
  const y = purchase.getUTCFullYear();
  const m = purchase.getUTCMonth() + 1;
  const closing = clampDay(y, m, closingDay);
  if (purchase.getTime() <= closing.getTime()) return cycleForClosingMonth(y, m, closingDay, dueDay);
  const next = addMonths(d(y, m, 1), 1);
  return cycleForClosingMonth(next.getUTCFullYear(), next.getUTCMonth() + 1, closingDay, dueDay);
}

export type InvoiceStatus = "OPEN" | "CLOSED" | "PAID" | "PARTIAL" | "OVERDUE";

export function invoiceStatus(args: {
  total: number; paid: number; closingDate: DateOnly; dueDate: DateOnly; today: DateOnly;
}): InvoiceStatus {
  const { total, paid, closingDate, dueDate, today } = args;
  if (total > 0 && paid >= total) return "PAID";
  if (today.getTime() <= closingDate.getTime()) return "OPEN";
  if (today.getTime() > dueDate.getTime()) return "OVERDUE";
  return paid > 0 ? "PARTIAL" : "CLOSED";
}

export { monthKey };
