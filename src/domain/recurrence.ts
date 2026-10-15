import { addDays, addMonths, type DateOnly } from "./dates";

export type RecurrenceKind = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM";

/** n-ésima ocorrência, sempre calculada a partir do início (sem deriva de fim de mês). */
export function nthOccurrence(start: DateOnly, kind: RecurrenceKind, n: number, intervalDays?: number): DateOnly {
  switch (kind) {
    case "WEEKLY": return addDays(start, 7 * n);
    case "BIWEEKLY": return addDays(start, 14 * n);
    case "MONTHLY": return addMonths(start, n);
    case "YEARLY": return addMonths(start, 12 * n);
    case "CUSTOM":
      if (!intervalDays || intervalDays < 1) throw new Error("Intervalo personalizado inválido");
      return addDays(start, intervalDays * n);
  }
}

/** Todas as ocorrências com data ≤ `until` (e ≤ endDate). Determinístico: base da idempotência. */
export function occurrencesUntil(args: {
  start: DateOnly; kind: RecurrenceKind; intervalDays?: number; endDate?: DateOnly | null; until: DateOnly;
}): DateOnly[] {
  const out: DateOnly[] = [];
  for (let n = 0; n < 5000; n++) {
    const dt = nthOccurrence(args.start, args.kind, n, args.intervalDays);
    if (dt.getTime() > args.until.getTime()) break;
    if (args.endDate && dt.getTime() > args.endDate.getTime()) break;
    out.push(dt);
  }
  return out;
}

/** Equivalente mensal de um compromisso (para somar "quanto minhas contas fixas custam por mês"). */
export function monthlyEquivalent(amount: number, kind: RecurrenceKind, intervalDays?: number): number {
  switch (kind) {
    case "WEEKLY": return Math.round((amount * 52) / 12);
    case "BIWEEKLY": return Math.round((amount * 26) / 12);
    case "MONTHLY": return amount;
    case "YEARLY": return Math.round(amount / 12);
    case "CUSTOM":
      if (!intervalDays || intervalDays < 1) throw new Error("Intervalo personalizado inválido");
      return Math.round((amount * 365) / intervalDays / 12);
  }
}
