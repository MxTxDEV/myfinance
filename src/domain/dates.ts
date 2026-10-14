// Datas "só dia" (sem hora) como Date em UTC meia-noite. Evita bugs de fuso.
export type DateOnly = Date;

export function d(y: number, m: number, day: number): DateOnly {
  return new Date(Date.UTC(y, m - 1, day));
}
export function parseISODate(s: string): DateOnly {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Data inválida: ${s}`);
  const dt = d(+m[1], +m[2], +m[3]);
  if (dt.getUTCMonth() !== +m[2] - 1) throw new Error(`Data inexistente: ${s}`);
  return dt;
}
export function iso(dt: DateOnly): string {
  return dt.toISOString().slice(0, 10);
}
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** Dia `day` do mês (y,m), limitado ao último dia do mês (31 → 28/29/30). */
export function clampDay(y: number, m: number, day: number): DateOnly {
  return d(y, m, Math.min(day, daysInMonth(y, m)));
}
/** Soma meses mantendo o dia, limitando ao fim do mês (31/jan + 1 = 28/fev). */
export function addMonths(dt: DateOnly, n: number): DateOnly {
  const total = dt.getUTCFullYear() * 12 + dt.getUTCMonth() + n;
  return clampDay(Math.floor(total / 12), (total % 12) + 1, dt.getUTCDate());
}
export function addDays(dt: DateOnly, n: number): DateOnly {
  return new Date(dt.getTime() + n * 86_400_000);
}
export function monthKey(dt: DateOnly): string {
  return iso(dt).slice(0, 7);
}
export function monthRange(key: string): { start: DateOnly; end: DateOnly } {
  const [y, m] = key.split("-").map(Number);
  return { start: d(y, m, 1), end: d(y, m, daysInMonth(y, m)) };
}
/** "Hoje" no fuso de São Paulo, como data-só-dia. */
export function todayBR(now: Date = new Date()): DateOnly {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  return parseISODate(s);
}
export function diffDays(a: DateOnly, b: DateOnly): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}
