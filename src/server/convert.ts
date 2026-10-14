import { toCents, toDecimalString, type Cents } from "@/domain/money";
import { iso, parseISODate } from "@/domain/dates";

/** Valor Decimal do Prisma → centavos. */
export const cents = (v: { toString(): string }): Cents => toCents(v.toString());
/** Centavos → string aceita pelo Prisma para colunas Decimal. */
export const dec = (c: Cents): string => toDecimalString(c);
export const dateIn = (s: string) => parseISODate(s);
export const dateOut = (dt: Date) => iso(dt);
