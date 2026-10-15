import { prisma } from "../db";
import { cents, dateOut } from "../convert";
import { budgetOverview, goalsOverview } from "./planning";
import { cardOverview } from "./cards";
import { monthSummary } from "./reports";
import { addDays, addMonths, diffDays, monthKey, monthRange, todayBR, type DateOnly } from "@/domain/dates";
import { dueStage } from "@/domain/schedule";
import { readPrefs } from "../push-prefs";
import { formatBRL } from "@/domain/money";
import type { NotificationType } from "@prisma/client";

type Draft = { type: NotificationType; title: string; body: string; dedupeKey: string };
const br = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Gera notificações internas (que também viram push). Idempotente (dedupeKey único) e discreta:
 * um aviso por ESTÁGIO de cada vencimento (padrão: 3 dias antes, 1 dia antes e no dia), nunca repetido
 * a cada abertura. O que gerar depende de Profile.notifyPrefs.menu (ver push-prefs.ts).
 */
export async function generateNotifications(today: DateOnly = todayBR()) {
  const profile = await prisma.profile.findFirst();
  const prefs = readPrefs(profile?.notifyPrefs);
  const stages = prefs.stages;
  const maxStage = Math.max(...stages);
  const drafts: Draft[] = [];
  const when = (days: number) => (days === 0 ? "HOJE" : days === 1 ? "amanhã" : `em ${days} dias`);
  const icon = (days: number) => (days === 0 ? "🚨" : days === 1 ? "⏰" : "📅");

  if (prefs.alerts.bills) {
    const planned = await prisma.transaction.findMany({
      where: { deletedAt: null, status: "PLANNED", type: { in: ["EXPENSE", "INCOME"] }, date: { lte: addDays(today, maxStage) } },
    });
    for (const t of planned) {
      const iso = dateOut(t.date), v = formatBRL(cents(t.amount)), days = diffDays(t.date, today), exp = t.type === "EXPENSE";
      if (days < 0) drafts.push({ type: "OVERDUE", title: exp ? "❗ Conta atrasada" : "❗ Recebimento atrasado", body: `${t.description} (${v}) venceu em ${br(iso)}.`, dedupeKey: `overdue:${t.id}` });
      else {
        const st = dueStage(days, stages);
        if (st !== null) drafts.push({ type: "DUE_SOON", title: `${icon(days)} ${exp ? "Conta vence" : "Recebimento"} ${when(days)}`, body: `${t.description} — ${v} (${br(iso)}).`, dedupeKey: `due:${t.id}:${st}` });
      }
    }
  }

  if (prefs.alerts.invoices) {
    for (const c of await cardOverview(today)) for (const i of c.invoices) {
      if (i.remaining <= 0) continue;
      const close = new Date(i.closingDate + "T00:00:00Z"), due = new Date(i.dueDate + "T00:00:00Z");
      const dClose = diffDays(close, today), dDue = diffDays(due, today);
      if (dClose >= 0 && dClose <= maxStage) drafts.push({ type: "INVOICE_CLOSING", title: `💳 Fatura ${c.name} fecha ${when(dClose)}`, body: `Compras depois de ${br(i.closingDate)} vão para a próxima fatura.`, dedupeKey: `inv-close:${i.id}` });
      const st = dueStage(dDue, stages);
      if (st !== null) drafts.push({ type: "INVOICE_DUE", title: `${icon(dDue)} Fatura ${c.name} vence ${when(dDue)}`, body: `${formatBRL(i.remaining)} até ${br(i.dueDate)}.`, dedupeKey: `inv-due:${i.id}:${st}` });
      if (dDue < 0) drafts.push({ type: "OVERDUE", title: `❗ Fatura ${c.name} atrasada`, body: `${formatBRL(i.remaining)} venceu em ${br(i.dueDate)}.`, dedupeKey: `inv-over:${i.id}` });
    }
  }

  if (prefs.alerts.debts) {
    for (const x of await prisma.debt.findMany({ where: { archivedAt: null, balance: { gt: 0 }, nextDueDate: { not: null } } })) {
      const iso = dateOut(x.nextDueDate!), days = diffDays(x.nextDueDate!, today);
      const parcela = x.installmentAmount ? ` — parcela de ${formatBRL(cents(x.installmentAmount))}` : "";
      if (days < 0) drafts.push({ type: "OVERDUE", title: `❗ Dívida "${x.name}" atrasada`, body: `Venceu em ${br(iso)}${parcela}.`, dedupeKey: `debt-over:${x.id}:${iso}` });
      else {
        const st = dueStage(days, stages);
        if (st !== null) drafts.push({ type: "DEBT_DUE", title: `${icon(days)} "${x.name}" vence ${when(days)}`, body: `${br(iso)}${parcela}.`, dedupeKey: `debt-due:${x.id}:${iso}:${st}` });
      }
    }
  }

  const key = monthKey(today);
  if (prefs.alerts.budget) for (const b of (await budgetOverview(key)).items) {
    const top = b.crossed[b.crossed.length - 1];
    if (top) drafts.push({ type: "BUDGET", title: top >= 100 ? `Orçamento de ${b.category} atingido` : `${b.category}: ${top}% do orçamento`, body: `Gasto ${formatBRL(b.spent)} de ${formatBRL(b.limit)} neste mês.`, dedupeKey: `budget:${b.id}:${key}:${top}` });
  }

  if (prefs.alerts.goals) for (const g of (await goalsOverview(today)).items) {
    if (g.percent < 100 && (g.daysSinceLastEntry ?? 999) > 30) drafts.push({ type: "GOAL_STALLED", title: `Meta "${g.name}" sem progresso`, body: "Nenhum aporte nos últimos 30 dias.", dedupeKey: `goal:${g.id}:${key}` });
  }

  const prev = monthKey(addMonths(monthRange(key).start, -1));
  const s = await monthSummary(prev);
  if (prefs.alerts.monthlySummary && s.income + s.expense > 0) drafts.push({ type: "MONTHLY_SUMMARY", title: `Resumo de ${prev.split("-").reverse().join("/")}`, body: `Receitas ${formatBRL(s.income)}, despesas ${formatBRL(s.expense)}, resultado ${formatBRL(s.result)}.`, dedupeKey: `summary:${prev}` });

  const r = await prisma.notification.createMany({ data: drafts, skipDuplicates: true });
  return { created: r.count };
}

export const unreadCount = () => prisma.notification.count({ where: { readAt: null } });
export const listNotifications = () => prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
export const markAllRead = () => prisma.notification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
