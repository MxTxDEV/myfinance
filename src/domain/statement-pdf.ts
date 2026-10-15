// Interpretação de texto extraído de PDFs de extrato/fatura — funções puras.
// A extração do texto (pdf.js) acontece no aparelho do usuário; aqui só se entende o que veio.
import { parseAmount, normalizeDescription, type StatementRow } from "./statement";

export const PDF_MARKER = "%%PDFTEXT%%";
export interface TextItem { str: string; x: number; y: number; w: number }

/** Reconstrói as linhas de uma página a partir dos pedaços de texto (agrupa por altura, ordena por posição). */
export function itemsToLines(items: TextItem[]): string[] {
  const rows: { y: number; items: TextItem[] }[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 2.5);
    if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
  }
  return rows.sort((a, b) => b.y - a.y).map((r) => {
    const sorted = r.items.sort((a, b) => a.x - b.x);
    let line = "", end = -Infinity;
    for (const it of sorted) {
      const gap = it.x - end;
      line += (line === "" ? "" : gap > 10 ? "  " : gap > 1.2 ? " " : "") + it.str.trim();
      end = it.x + it.w;
    }
    return line;
  });
}

const MONTHS: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const MONEY_RE = /([-−+(]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}\)?)\s*(CR|DB|C|D|-)?(?![\d,])/g;
const JUNK_RE = /saldo (anterior|inicial|final|total|dispon|do dia|em conta|bloqueado)|total (da fatura|de compras|a pagar|geral|de despesas|das)|pagamento m[ií]nimo|limite (total|dispon|de cr)|^vencimento|fechamento|encargos|resumo|p[aá]gina \d|ag[eê]ncia|extrato|per[ií]odo|emiss[aã]o|^cpf|^cnpj|titular|^data\s+(hist|descr|lan)|valor (total|da fatura)/i;
const EXPENSE_RE = /compra|pagamento|pagto|pgto|enviad|tarifa|saque|d[eé]bito|boleto|fatura|juros|iof|seguro|anuidade|mensalidade|assinatura|parcela/i;
const INCOME_RE = /recebid|dep[oó]sito|sal[aá]rio|cr[eé]dito em|estorno|rendimento|reembolso|resgate|proventos|devolu/i;

export interface PdfRow extends StatementRow { signUnknown?: boolean; hintType?: "INCOME" | "EXPENSE" }

function dateAtStart(line: string, year: number): { iso: string; rest: string } | null {
  let m: RegExpExecArray | null;
  const mk = (d: number, mo: number, y: number, rest: string) => {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
      ? { iso: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, rest } : null;
  };
  if ((m = /^(\d{2})\/(\d{2})\/(\d{4})\b\s*/.exec(line))) return mk(+m[1], +m[2], +m[3], line.slice(m[0].length));
  if ((m = /^(\d{2})\/(\d{2})\/(\d{2})\b\s*/.exec(line))) return mk(+m[1], +m[2], 2000 + +m[3], line.slice(m[0].length));
  if ((m = /^(\d{2})\/(\d{2})(?![\d/])\s*/.exec(line))) return mk(+m[1], +m[2], year, line.slice(m[0].length));
  if ((m = /^(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?:\s+(\d{4}))?\s*/i.exec(line))) return mk(+m[1], MONTHS[m[2].toLowerCase()], m[3] ? +m[3] : year, line.slice(m[0].length));
  return null;
}

function tokenSign(raw: string, suffix: string | undefined): number | null {
  const s = raw.trim();
  if (/^[-−(]/.test(s) || suffix === "-" || suffix === "D" || suffix === "DB") return -1;
  if (/^\+/.test(s) || suffix === "C" || suffix === "CR") return 1;
  return null;
}

/**
 * Entende o texto de um PDF de extrato ou fatura. Cada linha com data no começo e valor vira uma transação.
 * - Se a linha traz o saldo depois do valor, o sinal é conferido pela variação do saldo (à prova de erro).
 * - Marcadores D/C, "-" e parênteses definem o sinal; sem marcador, o sinal fica "não identificado" (o app pergunta/sugere).
 */
export function parsePDFText(text: string, ref: { today: string } = { today: new Date().toISOString().slice(0, 10) }): { rows: PdfRow[]; warnings: string[]; format: "pdf" } {
  const lines = text.replace(PDF_MARKER, "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const years = [...text.matchAll(/\b\d{2}\/\d{2}\/(20\d{2})\b/g)].map((m) => +m[1]);
  const counts = new Map<number, number>(); years.forEach((y) => counts.set(y, (counts.get(y) ?? 0) + 1));
  const ctxYear = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? +ref.today.slice(0, 4);

  const rows: PdfRow[] = [];
  let prevBal: number | null = null;
  for (const raw of lines) {
    const lead = dateAtStart(raw, ctxYear);
    const bal = /saldo (anterior|inicial|do dia anterior)/i.test(raw) ? [...raw.matchAll(MONEY_RE)].map((m) => parseAmount(m[1].replace("−", "-")))[0] : null;
    if (bal !== null && bal !== undefined) { prevBal = bal; continue; }
    if (JUNK_RE.test(raw) || !lead) continue;
    const moneys = [...lead.rest.matchAll(MONEY_RE)];
    if (moneys.length === 0) continue;
    const [first, second] = moneys;
    const parsed = parseAmount(first[1].replace("−", "-").replace(/^[-+]/, ""));
    const abs = parsed === null ? null : Math.abs(parsed);
    if (abs === null || abs === 0) continue;
    let sign = tokenSign(first[1], first[2]);
    const balance = second ? parseAmount(second[1].replace("−", "-")) : null;
    if (balance !== null && prevBal !== null) {
      const delta = balance - prevBal;
      if (Math.abs(delta) === abs) sign = delta > 0 ? 1 : -1; // o saldo confirma o sinal
    }
    if (balance !== null) prevBal = balance;
    const desc = lead.rest.replace(MONEY_RE, " ").replace(/\b(R\$)\b/g, " ").replace(/\s+[-–]\s*$/, "").replace(/\s{2,}/g, " ").replace(/^[-–:\s]+/, "").trim();
    const hint: "INCOME" | "EXPENSE" | undefined = INCOME_RE.test(desc) && !EXPENSE_RE.test(desc) ? "INCOME" : EXPENSE_RE.test(desc) ? "EXPENSE" : undefined;
    if (!normalizeDescription(desc) && !desc) continue;
    const row: PdfRow = { date: lead.iso, description: desc || "Sem descrição", amount: (sign ?? 1) * abs };
    if (sign === null) { row.signUnknown = true; row.hintType = hint; }
    rows.push(row);
  }
  const warnings = rows.length === 0
    ? ["Não consegui reconhecer transações neste PDF. Ele pode ser uma imagem (digitalizado) ou ter um layout diferente — use o OFX/CSV do app do banco."]
    : ["Lido de um PDF: confira datas, valores e se cada item é entrada ou saída antes de importar."];
  return { rows, warnings, format: "pdf" };
}
