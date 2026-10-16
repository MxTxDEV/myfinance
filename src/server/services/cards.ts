import { prisma, type Db } from "../db";
import { cents, dateIn, dateOut, dec } from "../convert";
import { DomainError } from "../errors";
import { cardInput, invoicePaymentInput, type CardInput, type InvoicePaymentInput } from "../schemas";
import { invoiceForPurchase, invoiceStatus } from "@/domain/card";
import { addDays, parseISODate, todayBR, type DateOnly } from "@/domain/dates";
import type { Cents } from "@/domain/money";

/** Obtém (ou cria, de forma idempotente) a fatura de um cartão para a data de compra. */
export async function ensureInvoice(db: Db, card: { id: string; closingDay: number; dueDay: number }, purchase: DateOnly) {
  const c = invoiceForPurchase(purchase, card.closingDay, card.dueDay);
  return db.invoice.upsert({
    where: { cardId_referenceMonth: { cardId: card.id, referenceMonth: c.referenceMonth } },
    update: {},
    create: { cardId: card.id, referenceMonth: c.referenceMonth, closingDate: c.closingDate, dueDate: c.dueDate },
  });
}

export async function createCard(raw: CardInput) {
  const v = cardInput.parse(raw);
  const acc = await prisma.account.findFirst({ where: { id: v.payAccountId, archivedAt: null } });
  if (!acc) throw new DomainError("Conta de pagamento inválida");
  const { monthlyRate, ...rest } = v;
  return prisma.creditCard.create({ data: { ...rest, limit: dec(v.limit), monthlyRate: monthlyRate?.toString() } });
}
export async function updateCard(id: string, raw: Partial<CardInput>) {
  const v = cardInput.partial().parse(raw);
  const { limit, monthlyRate, ...rest } = v;
  return prisma.creditCard.update({ where: { id }, data: { ...rest, ...(limit !== undefined ? { limit: dec(limit) } : {}), ...(monthlyRate !== undefined ? { monthlyRate: monthlyRate.toString() } : {}) } });
}
export const archiveCard = (id: string) => prisma.creditCard.update({ where: { id }, data: { archivedAt: new Date() } });

export interface InvoiceView {
  id: string; cardId: string; referenceMonth: string; closingDate: string; dueDate: string;
  total: Cents; paid: Cents; remaining: Cents; status: ReturnType<typeof invoiceStatus>;
}

async function invoiceTotals(db: Db, invoiceIds: string[]) {
  const rows = await db.transaction.groupBy({
    by: ["invoiceId", "type"],
    where: { deletedAt: null, invoiceId: { in: invoiceIds }, type: { in: ["EXPENSE", "CARD_BALANCE", "INVOICE_PAYMENT"] } },
    _sum: { amount: true },
  });
  const m = new Map<string, { total: Cents; paid: Cents }>();
  for (const r of rows) {
    const e = m.get(r.invoiceId!) ?? { total: 0, paid: 0 };
    const v = r._sum.amount ? cents(r._sum.amount) : 0;
    if (r.type === "INVOICE_PAYMENT") e.paid += v; else e.total += v; // compras + saldo informado
    m.set(r.invoiceId!, e);
  }
  return m;
}

export async function invoiceViews(cardId: string, today: DateOnly = todayBR(), db: Db = prisma): Promise<InvoiceView[]> {
  const invoices = await db.invoice.findMany({ where: { cardId }, orderBy: { closingDate: "asc" } });
  const totals = await invoiceTotals(db, invoices.map((i) => i.id));
  return invoices.map((i) => {
    const t = totals.get(i.id) ?? { total: 0, paid: 0 };
    return {
      id: i.id, cardId: i.cardId, referenceMonth: i.referenceMonth,
      closingDate: dateOut(i.closingDate), dueDate: dateOut(i.dueDate),
      total: t.total, paid: t.paid, remaining: Math.max(0, t.total - t.paid),
      status: invoiceStatus({ ...t, closingDate: i.closingDate, dueDate: i.dueDate, today }),
    };
  });
}

/** Limite usado = tudo que foi comprado no cartão e ainda não foi pago (inclui parcelas futuras). */
export async function cardOverview(today: DateOnly = todayBR(), db: Db = prisma) {
  const cards = await db.creditCard.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } });
  const out = [];
  for (const c of cards) {
    const invoices = await invoiceViews(c.id, today, db);
    const purchases = invoices.reduce((s, i) => s + i.total, 0);
    const paid = invoices.reduce((s, i) => s + i.paid, 0);
    const used = Math.max(0, purchases - paid);
    const limit = cents(c.limit);
    const next = invoiceForPurchase(today, c.closingDay, c.dueDay); // fatura que recebe compras de hoje
    const open = invoices.find((i) => i.remaining > 0) ?? null;
    out.push({
      id: c.id, name: c.name, issuer: c.issuer, color: c.color, closingDay: c.closingDay, dueDay: c.dueDay,
      payAccountId: c.payAccountId, limit, used, available: limit - used,
      nextClosing: dateOut(next.closingDate), nextDue: dateOut(next.dueDate),
      currentInvoice: open,
      invoices,
    });
  }
  return out;
}

/**
 * Pagamento (total ou parcial) de fatura: saída da conta bancária, vinculada à fatura.
 * NÃO é despesa — a despesa já foi reconhecida na compra (tipo INVOICE_PAYMENT fica fora dos relatórios).
 */
export async function payInvoice(raw: InvoicePaymentInput) {
  const v = invoicePaymentInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: v.invoiceId }, include: { card: true } });
    if (!inv) throw new DomainError("Fatura não encontrada");
    const [view] = (await invoiceViews(inv.cardId, todayBR(), tx)).filter((i) => i.id === inv.id);
    if (v.amount > view.remaining) throw new DomainError("O pagamento é maior que o valor em aberto da fatura");
    const accountId = v.accountId ?? inv.card.payAccountId;
    const acc = await tx.account.findFirst({ where: { id: accountId, archivedAt: null } });
    if (!acc) throw new DomainError("Conta de pagamento inválida");
    return tx.transaction.create({
      data: {
        type: "INVOICE_PAYMENT", status: "SETTLED", amount: dec(v.amount), date: dateIn(v.date), settledAt: new Date(),
        description: `Fatura ${inv.card.name} ${inv.referenceMonth}`, accountId, invoiceId: inv.id,
      },
    });
  });
}


/* ───────────── Faturas por mês: atual, próxima e as seguintes ───────────── */
export interface TimelineInvoice {
  referenceMonth: string; invoiceId: string | null; closingDate: string; dueDate: string;
  total: Cents; paid: Cents; remaining: Cents;
  base: Cents; // saldo informado à mão (compras e parcelas de antes do app)
  purchases: Cents; // lançado no app (compras novas e parcelas)
  status: ReturnType<typeof invoiceStatus>;
}

/**
 * As próximas `count` faturas do cartão, começando pela mais antiga ainda em aberto (a "atual").
 * A seguinte é a "próxima". Meses sem nenhum lançamento aparecem zerados, prontos para receber o saldo informado.
 */
export async function cardTimeline(cardId: string, today: DateOnly = todayBR(), count = 6, db: Db = prisma): Promise<TimelineInvoice[]> {
  const card = await db.creditCard.findFirst({ where: { id: cardId } });
  if (!card) throw new DomainError("Cartão não encontrado");
  const views = await invoiceViews(cardId, today, db);
  const bases = await db.transaction.groupBy({ by: ["invoiceId"], where: { deletedAt: null, cardId, type: "CARD_BALANCE" }, _sum: { amount: true } });
  const baseOf = new Map(bases.map((b) => [b.invoiceId, b._sum.amount ? cents(b._sum.amount) : 0]));

  let cycle = invoiceForPurchase(today, card.closingDay, card.dueDay);
  const oldest = views.find((v) => v.remaining > 0 && v.referenceMonth < cycle.referenceMonth);
  if (oldest) cycle = invoiceForPurchase(parseISODate(oldest.closingDate), card.closingDay, card.dueDay);
  const out: TimelineInvoice[] = [];
  for (let i = 0; i < count; i++) {
    const v = views.find((x) => x.referenceMonth === cycle.referenceMonth);
    const total = v?.total ?? 0, paid = v?.paid ?? 0, base = v ? (baseOf.get(v.id) ?? 0) : 0;
    out.push({
      referenceMonth: cycle.referenceMonth, invoiceId: v?.id ?? null, closingDate: dateOut(cycle.closingDate), dueDate: dateOut(cycle.dueDate),
      total, paid, remaining: Math.max(0, total - paid), base, purchases: total - base,
      status: invoiceStatus({ total, paid, closingDate: cycle.closingDate, dueDate: cycle.dueDate, today }),
    });
    cycle = invoiceForPurchase(addDays(cycle.closingDate, 1), card.closingDay, card.dueDay);
  }
  return out;
}

/**
 * Informa o que cada fatura já tem (compras e parcelas de antes de usar o app). Idempotente: refazer substitui o valor
 * anterior; zero remove. Compras novas continuam entrando por cima, sozinhas. Não é gasto do mês (não entra em relatórios/orçamento).
 */
export async function setInvoiceBases(cardId: string, rows: { referenceMonth: string; amount: number }[]) {
  const parsed = rows.map((r) => ({ referenceMonth: String(r.referenceMonth), amount: Math.round(r.amount) }));
  if (parsed.some((r) => !/^\d{4}-\d{2}$/.test(r.referenceMonth) || !Number.isFinite(r.amount) || r.amount < 0 || r.amount > 99_999_999_999)) throw new DomainError("Valores inválidos");
  return prisma.$transaction(async (tx) => {
    const card = await tx.creditCard.findFirst({ where: { id: cardId, archivedAt: null } });
    if (!card) throw new DomainError("Cartão não encontrado");
    const valid = new Map((await cardTimeline(cardId, todayBR(), 60, tx)).map((c) => [c.referenceMonth, c]));
    let changed = 0;
    for (const r of parsed) {
      const cyc = valid.get(r.referenceMonth);
      if (!cyc) throw new DomainError("Essa fatura está fora do período que dá para informar");
      const importKey = `carry:${cardId}:${r.referenceMonth}`;
      const existing = await tx.transaction.findUnique({ where: { importKey } });
      if (r.amount === 0) { if (existing) { await tx.transaction.deleteMany({ where: { id: existing.id } }); changed++; } continue; }
      if (existing) {
        if (cents(existing.amount) !== r.amount) { await tx.transaction.update({ where: { id: existing.id }, data: { amount: dec(r.amount), deletedAt: null } }); changed++; }
        continue;
      }
      const when = parseISODate(cyc.closingDate);
      const inv = await ensureInvoice(tx, card, when);
      await tx.transaction.create({
        data: { type: "CARD_BALANCE", status: "SETTLED", settledAt: new Date(), amount: dec(r.amount), date: when, description: "Saldo informado: compras e parcelas anteriores", cardId, invoiceId: inv.id, importKey },
      });
      changed++;
    }
    return { changed };
  });
}
