// Dinheiro = centavos inteiros (number seguro até ~R$ 90 trilhões). Nunca float em reais.
export type Cents = number;

const DECIMAL_RE = /^-?\d+(\.\d{1,2})?$/;

/** Converte string decimal ("12.34"), Prisma Decimal ou number com ≤2 casas em centavos, sem float. */
export function toCents(value: string | number | { toString(): string }): Cents {
  const s = typeof value === "number" ? value.toFixed(2) : value.toString();
  if (!DECIMAL_RE.test(s)) {
    // Decimal pode trazer mais casas (ex.: "12.340"); só aceita se extras forem zero.
    const m = /^(-?\d+)\.(\d{2})0*$/.exec(s);
    if (!m) throw new Error(`Valor monetário inválido: ${s}`);
    return toCents(`${m[1]}.${m[2]}`);
  }
  const neg = s.startsWith("-");
  const [int, frac = ""] = s.replace("-", "").split(".");
  const cents = Number(int) * 100 + Number(frac.padEnd(2, "0"));
  return neg ? -cents : cents;
}

/** Centavos → string decimal para o banco ("1234.50"). */
export function toDecimalString(cents: Cents): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatBRL(cents: Cents): string {
  // Intl usa NBSP; troca por espaço comum para consistência em testes/CSV.
  return brl.format(cents / 100).replace(/ /g, " ");
}

/** Interpreta entrada do usuário: "1.234,56", "R$ 12,5", "12" → centavos. Retorna null se inválido. */
export function parseBRL(input: string): Cents | null {
  const cleaned = input.replace(/[R$\s]/g, "");
  if (!cleaned) return null;
  const neg = cleaned.startsWith("-");
  const body = cleaned.replace("-", "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{0,2})?$|^\d+(,\d{0,2})?$/.test(body)) return null;
  const [int, frac = ""] = body.replace(/\./g, "").split(",");
  const v = Number(int) * 100 + Number(frac.padEnd(2, "0"));
  return neg ? -v : v;
}

/**
 * Divide `total` em `n` parcelas. Regra de arredondamento (documentada):
 * base = floor(total/n); os centavos restantes são distribuídos 1 a 1 às PRIMEIRAS parcelas.
 * A soma das parcelas é sempre exatamente `total`.
 */
export function splitInstallments(total: Cents, n: number): Cents[] {
  if (!Number.isInteger(n) || n < 1) throw new Error("Número de parcelas inválido");
  if (!Number.isInteger(total) || total <= 0) throw new Error("Total inválido");
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Percentual com arredondamento half-up para 1 casa, usando inteiros (bps). */
export function percent(part: Cents, whole: Cents): number | null {
  if (whole === 0) return null;
  return Math.round((part * 1000) / whole) / 10;
}
