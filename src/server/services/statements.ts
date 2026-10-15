import { prisma } from "../db";
import { cents, dateIn } from "../convert";
import { DomainError } from "../errors";
import { createTransaction } from "./transactions";
import { importKeys, looksLikeInvoicePayment, normalizeDescription, parseStatement } from "@/domain/statement";
import { addDays } from "@/domain/dates";
import { z } from "zod";

export type TargetKind = "account" | "card";
export interface PreviewRow {
  key: string; date: string; description: string; amount: number; // amount em centavos, sempre positivo
  type: "INCOME" | "EXPENSE"; categoryId: string | null;
  duplicate: "exact" | "maybe" | null; skip: boolean; note: string | null;
}
const MAX_CHARS = 2_000_000;

async function requireTarget(kind: TargetKind, id: string) {
  const t = kind === "account" ? await prisma.account.findFirst({ where: { id, archivedAt: null } }) : await prisma.creditCard.findFirst({ where: { id, archivedAt: null } });
  if (!t) throw new DomainError(kind === "account" ? "Conta não encontrada" : "Cartão não encontrado");
}

/** Categoria mais usada para cada descrição normalizada (aprende com o que você já lançou). */
async function learnedCategories() {
  const rows = await prisma.transaction.groupBy({
    by: ["description", "categoryId", "type"], _count: { _all: true },
    where: { deletedAt: null, categoryId: { not: null }, type: { in: ["INCOME", "EXPENSE"] }, planId: null },
    orderBy: { _count: { description: "desc" } }, take: 3000,
  });
  const best = new Map<string, { id: string; n: number }>();
  for (const r of rows) {
    const k = `${r.type}|${normalizeDescription(r.description)}`;
    if (k.endsWith("|")) continue;
    const cur = best.get(k);
    if (!cur || cur.n < r._count._all) best.set(k, { id: r.categoryId!, n: r._count._all });
  }
  return best;
}

/**
 * Lê o arquivo e mostra o que seria importado, sem gravar nada.
 * - cartão: o sinal predominante do arquivo são as compras; o resto (pagamentos/estornos) vem desmarcado;
 * - conta: pagamento de fatura vem desmarcado (já foi contado nas compras do cartão);
 * - duplicados exatos (mesmo arquivo/linha) e prováveis (já lançado à mão: mesmo valor, ±1 dia) vêm desmarcados.
 */
export async function previewStatement(input: { text: string; kind: TargetKind; targetId: string }) {
  const v = z.object({ text: z.string().min(1).max(MAX_CHARS), kind: z.enum(["account", "card"]), targetId: z.string().min(1) }).parse(input);
  await requireTarget(v.kind, v.targetId);
  const parsed = parseStatement(v.text);
  if (parsed.rows.length === 0) return { rows: [] as PreviewRow[], warnings: parsed.warnings, format: parsed.format };
  if (parsed.rows.length > 2000) throw new DomainError("Arquivo grande demais (máx. 2.000 linhas por importação). Divida por período.");

  const keys = importKeys(parsed.rows).map((k) => `${v.kind}:${v.targetId}:${k}`);
  const existing = new Set((await prisma.transaction.findMany({ where: { importKey: { in: keys } }, select: { importKey: true } })).map((t) => t.importKey));
  const learned = await learnedCategories();

  const dates = parsed.rows.map((r) => r.date).sort();
  const near = await prisma.transaction.findMany({
    where: {
      deletedAt: null, type: { in: ["INCOME", "EXPENSE"] }, importKey: null,
      ...(v.kind === "account" ? { accountId: v.targetId } : { cardId: v.targetId }),
      date: { gte: addDays(dateIn(dates[0]), -1), lte: addDays(dateIn(dates[dates.length - 1]), 1) },
    },
    select: { id: true, amount: true, type: true, date: true },
  });
  const used = new Set<string>();

  const negatives = parsed.rows.filter((r) => r.amount < 0).length;
  const purchasesAreNegative = negatives > parsed.rows.length / 2; // cartão: qual sinal é "compra"?

  const rows: PreviewRow[] = parsed.rows.map((r, i) => {
    const abs = Math.abs(r.amount);
    let type: "INCOME" | "EXPENSE"; let note: string | null = null; let skip = false;
    if (v.kind === "account") type = r.amount > 0 ? "INCOME" : "EXPENSE";
    else {
      type = "EXPENSE";
      const isPurchase = purchasesAreNegative ? r.amount < 0 : r.amount > 0;
      if (!isPurchase) { skip = true; note = "Pagamento ou estorno da fatura — não é compra."; }
    }
    if (v.kind === "account" && looksLikeInvoicePayment(r.description)) { skip = true; note = "Pagamento de fatura: registre em Perfil → cartão → Pagar, para não contar duas vezes."; }
    let duplicate: PreviewRow["duplicate"] = null;
    if (existing.has(keys[i])) { duplicate = "exact"; skip = true; note = "Já importado antes."; }
    else {
      const d0 = dateIn(r.date).getTime();
      const m = near.find((t) => !used.has(t.id) && t.type === type && cents(t.amount) === abs && Math.abs(t.date.getTime() - d0) <= 86_400_000);
      if (m) { used.add(m.id); duplicate = "maybe"; skip = true; note = "Parece já lançado por você (mesmo valor, data próxima)."; }
    }
    const cat = learned.get(`${type}|${normalizeDescription(r.description)}`)?.id ?? null;
    return { key: keys[i].slice(`${v.kind}:${v.targetId}:`.length), date: r.date, description: r.description, amount: abs, type, categoryId: cat, duplicate, skip, note };
  });
  return { rows, warnings: parsed.warnings, format: parsed.format };
}

const commitSchema = z.object({
  kind: z.enum(["account", "card"]), targetId: z.string().min(1),
  rows: z.array(z.object({
    key: z.string().min(1).max(250), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), description: z.string().trim().min(1).max(120),
    amount: z.number().int().positive(), type: z.enum(["INCOME", "EXPENSE"]), categoryId: z.string().nullable(),
  })).min(1).max(2000),
});

/**
 * Grava as linhas escolhidas como lançamentos já efetivados (mesmas regras de qualquer lançamento: saldo, fatura,
 * limite, orçamento, relatórios, patrimônio). Idempotente por linha (importKey): repetir não duplica.
 */
export async function commitStatement(input: z.input<typeof commitSchema>) {
  const v = commitSchema.parse(input);
  await requireTarget(v.kind, v.targetId);
  const fallback = {
    INCOME: await prisma.category.findFirst({ where: { type: "INCOME", name: "Outras receitas", archivedAt: null } }),
    EXPENSE: await prisma.category.findFirst({ where: { type: "EXPENSE", name: "Outras despesas", archivedAt: null } }),
  };
  const keys = v.rows.map((r) => `${v.kind}:${v.targetId}:${r.key}`);
  const before = new Set((await prisma.transaction.findMany({ where: { importKey: { in: keys } }, select: { importKey: true } })).map((t) => t.importKey));
  let created = 0, skipped = 0;
  const errors: string[] = [];
  for (let i = 0; i < v.rows.length; i++) {
    const r = v.rows[i];
    if (before.has(keys[i])) { skipped++; continue; }
    const categoryId = r.categoryId ?? fallback[r.type]?.id;
    if (!categoryId) { errors.push(`${r.description}: escolha uma categoria`); continue; }
    if (v.kind === "card" && r.type === "INCOME") { errors.push(`${r.description}: cartão só recebe compras`); continue; }
    try {
      await createTransaction({
        type: r.type, amount: r.amount, description: r.description, date: r.date, categoryId, status: "SETTLED", installments: 1,
        ...(v.kind === "account" ? { accountId: v.targetId } : { cardId: v.targetId }), importKey: keys[i],
      });
      created++;
    } catch (e) {
      errors.push(`${r.description}: ${e instanceof DomainError ? e.message : "não foi possível importar"}`);
    }
  }
  return { created, skipped, errors: errors.slice(0, 10) };
}
