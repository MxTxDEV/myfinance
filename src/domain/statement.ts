// Leitura de extratos (OFX e CSV) — funções puras. Valores em centavos inteiros, datas "YYYY-MM-DD".
export interface StatementRow {
  date: string;
  description: string;
  amount: number; // centavos; negativo = saída, positivo = entrada (como vem no extrato)
  externalId?: string; // FITID do OFX / identificador do banco
}
export interface ParsedStatement { rows: StatementRow[]; warnings: string[]; format: "ofx" | "csv" | "pdf" }

/** "1.234,56", "-1234.56", "R$ 12,5", "(45,90)" → centavos. null se não for número. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[R$\s ]/g, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); } else if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) { neg = !neg; s = s.slice(0, -1); }
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  let dec = "";
  if (lastComma >= 0 && lastDot >= 0) dec = lastComma > lastDot ? "," : ".";
  else if (lastComma >= 0) dec = ","; // "12,5" / "1234,56"
  else if (lastDot >= 0) dec = /^\d{1,3}(\.\d{3})+$/.test(s) ? "" : "."; // "1.234" = milhar; "12.5" = decimal
  const [int, frac = ""] = dec ? [s.slice(0, s.lastIndexOf(dec)), s.slice(s.lastIndexOf(dec) + 1)] : [s, ""];
  const digits = int.replace(/[.,]/g, "");
  if (!/^\d*$/.test(digits) || !/^\d{0,2}$/.test(frac)) return null; // mais de 2 casas = não é dinheiro em reais
  if (digits === "" && frac === "") return null;
  const v = Number(digits || "0") * 100 + Number(frac.padEnd(2, "0") || "0");
  return neg ? -v : v;
}

/** dd/mm/aaaa, dd-mm-aaaa, dd/mm/aa, aaaa-mm-dd, aaaammdd(...) → "YYYY-MM-DD" (ou null). */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number, mt: RegExpExecArray | null;
  if ((mt = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else if ((mt = /^(\d{2})[/.-](\d{2})[/.-](\d{4})/.exec(s))) { d = +mt[1]; m = +mt[2]; y = +mt[3]; }
  else if ((mt = /^(\d{2})[/.-](\d{2})[/.-](\d{2})\b/.exec(s))) { d = +mt[1]; m = +mt[2]; y = 2000 + +mt[3]; }
  else if ((mt = /^(\d{4})(\d{2})(\d{2})/.exec(s))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Descrição "limpa" para comparar e aprender categorias: sem acentos, números, datas e prefixos genéricos. */
export function normalizeDescription(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(compra|pagamento|pagto|pix|ted|doc|debito|credito|cartao|transferencia|enviado|enviada|recebido|recebida|no|na|em|de|do|da|ref|parcela)\b/g, " ")
    .replace(/[\d*#\-_/.,:;()]+/g, " ").replace(/\s+/g, " ").trim();
}

// ─────────── OFX ───────────
export function parseOFX(text: string): ParsedStatement {
  const rows: StatementRow[] = [];
  const warnings: string[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const b of blocks) {
    const body = b.split(/<\/STMTTRN>/i)[0];
    const tag = (n: string) => new RegExp(`<${n}>([^<\\r\\n]*)`, "i").exec(body)?.[1]?.trim();
    const date = parseDate(tag("DTPOSTED") ?? ""), amount = parseAmount(tag("TRNAMT") ?? "");
    const description = (tag("MEMO") || tag("NAME") || "").replace(/&amp;/g, "&");
    if (!date || amount === null || amount === 0) { warnings.push("Uma linha do OFX foi ignorada (data ou valor ilegível)."); continue; }
    rows.push({ date, description: description || "Sem descrição", amount, externalId: tag("FITID") || undefined });
  }
  if (blocks.length === 0) warnings.push("Nenhuma transação encontrada no OFX.");
  return { rows, warnings, format: "ofx" };
}

// ─────────── CSV ───────────
function splitCSVLine(line: string, delim: string): string[] {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function parseCSV(text: string): ParsedStatement {
  const warnings: string[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], warnings: ["Arquivo vazio ou sem linhas de dados."], format: "csv" };
  const sample = lines.slice(0, 5);
  const delim = [";", "\t", ","].map((d) => ({ d, n: sample.reduce((a, l) => a + splitCSVLine(l, d).length, 0) })).sort((a, b) => b.n - a.n)[0].d;
  const header = splitCSVLine(lines[0], delim).map(strip);
  const find = (re: RegExp) => header.findIndex((h) => re.test(h));
  const iDate = find(/^(data|date|dt)/), iDesc = find(/descri|historico|estabelec|memo|lancamento|detalhe|title|nome/);
  const iVal = find(/^(valor|amount|quantia|value)/), iDeb = find(/debito|saida/), iCred = find(/credito|entrada/);
  const iId = find(/identificador|^id$|documento|codigo|autoriza/);
  if (iDate < 0 || iDesc < 0 || (iVal < 0 && (iDeb < 0 || iCred < 0))) {
    return { rows: [], warnings: ["Não reconheci as colunas. O CSV precisa ter cabeçalho com Data, Descrição e Valor (ou Débito/Crédito)."], format: "csv" };
  }
  const rows: StatementRow[] = [];
  for (const line of lines.slice(1)) {
    const c = splitCSVLine(line, delim);
    const date = parseDate(c[iDate] ?? "");
    let amount: number | null;
    if (iVal >= 0) amount = parseAmount(c[iVal] ?? "");
    else { const cr = parseAmount(c[iCred] ?? "") ?? 0, db = parseAmount(c[iDeb] ?? "") ?? 0; amount = cr - Math.abs(db); }
    if (!date || amount === null || amount === 0) { warnings.push(`Linha ignorada: ${line.slice(0, 60)}`); continue; }
    rows.push({ date, description: c[iDesc] || "Sem descrição", amount, externalId: iId >= 0 && c[iId] ? c[iId] : undefined });
  }
  return { rows, warnings: warnings.slice(0, 5), format: "csv" };
}

export function parseStatement(text: string): ParsedStatement {
  return /<OFX>|<STMTTRN>|OFXHEADER/i.test(text) ? parseOFX(text) : parseCSV(text);
}

/**
 * Chave de importação estável. Com identificador do banco: ele. Sem: data|valor|descrição + nº da ocorrência
 * dentro do arquivo (dois cafés iguais no mesmo dia continuam sendo dois; reimportar gera as mesmas chaves).
 */
export function importKeys(rows: StatementRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    if (r.externalId) return `id:${r.externalId}`;
    const base = `${r.date}|${r.amount}|${normalizeDescription(r.description)}`;
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    return `h:${base}|${n}`;
  });
}

/** Pagamento de fatura do cartão aparecendo no extrato da conta: não é despesa (já foi contada nas compras). */
export const looksLikeInvoicePayment = (desc: string) => /pagamento.{0,15}fatura|fatura.{0,20}cart|pgto.{0,10}fat|pagto.{0,10}fat/i.test(strip(desc));
