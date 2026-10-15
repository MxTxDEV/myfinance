// Sorteio de horários das mensagens e conversões de fuso (America/Sao_Paulo). Funções puras e determinísticas.

export const TZ = "America/Sao_Paulo";

/** "06:30" → 390 (minutos desde 00:00). Retorna null se inválido. */
export function parseHHMM(s: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export function formatHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Minutos desde 00:00 e data ("YYYY-MM-DD") de um instante, no fuso de São Paulo. */
export function localParts(now: Date): { day: string; minutes: number } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** Instante (UTC) em que, em São Paulo, é `minutes` do dia `day`. Respeita o deslocamento real do fuso. */
export function localInstant(day: string, minutes: number): Date {
  const [y, m, d] = day.split("-").map(Number);
  let guess = Date.UTC(y, m - 1, d, 0, 0) + minutes * 60_000;
  for (let i = 0; i < 3; i++) {
    const got = localParts(new Date(guess));
    const gotMs = Date.UTC(+got.day.slice(0, 4), +got.day.slice(5, 7) - 1, +got.day.slice(8, 10), 0, 0) + got.minutes * 60_000;
    const wantMs = Date.UTC(y, m - 1, d, 0, 0) + minutes * 60_000;
    if (gotMs === wantMs) break;
    guess += wantMs - gotMs;
  }
  return new Date(guess);
}

function rng(seedStr: string) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sorteia `count` minutos do dia dentro de [startMin, endMin], com no mínimo `gapMin` entre eles.
 * Se não couber, reduz a quantidade. Mesmo `seed` → mesmo resultado (estável).
 */
export function randomMinutes(args: { startMin: number; endMin: number; count: number; gapMin: number; seed: string }): number[] {
  const { startMin, endMin, gapMin, seed } = args;
  let count = Math.max(0, args.count);
  const span = endMin - startMin;
  if (span < 0) return [];
  while (count > 1 && span - gapMin * (count - 1) < 0) count--;
  if (count === 0) return [];
  const free = span - gapMin * (count - 1); // folga para distribuir
  const r = rng(seed);
  const base = Array.from({ length: count }, () => Math.floor(r() * (free + 1))).sort((a, b) => a - b);
  return base.map((b, i) => startMin + b + i * gapMin);
}

/**
 * Estágio de aviso de um vencimento: o MENOR estágio (em dias) que já alcançou a data.
 * Ex.: estágios [3,1,0]: faltam 2 dias → 3; falta 1 → 1; é hoje → 0; faltam 5 → null (cedo demais).
 * Assim cada conta gera no máximo um aviso por estágio, sem disparar vários de uma vez.
 */
export function dueStage(daysUntil: number, stages: number[]): number | null {
  const ok = [...stages].sort((a, b) => a - b).filter((s) => daysUntil <= s);
  return daysUntil < 0 || ok.length === 0 ? null : ok[0];
}
