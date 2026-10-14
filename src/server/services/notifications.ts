import { prisma } from "../db";
import { cents, dateOut } from "../convert";
import { budgetOverview, goalsOverview } from "./planning";
import { cardOverview } from "./cards";
import { monthSummary } from "./reports";
import { addDays, addMonths, monthKey, monthRange, todayBR, type DateOnly } from "@/domain/dates";
import { formatBRL } from "@/domain/money";
import type { NotificationType } from "@prisma/client";

type Draft = { type: NotificationType; title: string; body: string; dedupeKey: string };
const br = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Gera notificações internas. Idempotente (dedupeKey único) e discreta: no máximo uma por
 * evento, nunca repetida a cada abertura. Tipos podem ser desligados em Profile.notifyPrefs.disabled.
 */
export async function generateNotifications(today: DateOnly = todayBR()) {
  const profile = await prisma.profile.findFirst();
  const prefs = (profile?.notifyPrefs ?? {}) as { disabled?: NotificationType[]; leadDays?: number };
  const lead = prefs.leadDays ?? 3;
  const drafts: Draft[] = [];

  const planned = await prisma.transaction.findMany({
    where: { deletedAt: null, status: "PLANNED", type: { in: ["EXPENSE", "INCOME"] }, date: { lte: addDays(today, lead) } },
  });
  for (const t of planned) {
    const when = dateOut(t.date), v = formatBRL(cents(t.amount));
    if (t.date < today) drafts.push({ type: "OVERDUE", title: t.type === "EXPENSE" ? "Conta atrasada" : "Recebimento atrasado", body: `${t.description} (${v}) previsto para ${br(when)}.`, dedupeKey: `overdue:${t.id}` });
    else drafts.push({ type: "DUE_SOON", title: t.type === "EXPENSE" ? "Conta a vencer" : "Recebimento próximo", body: `${t.description} (${v}) em ${br(when)}.`, dedupeKey: `due:${t.id}` });
  }

  for (const c of await cardOverview(today)) for (const i of c.invoices) {
    if (i.remaining <= 0) continue;
    const close = new Date(i.closingDate + "T00:00:00Z"), due = new Date(i.dueDate + "T00:00:00Z");
    if (close >= today && close <= addDays(today, lead)) drafts.push({ type: "INVOICE_CLOSING", title: `Fatura ${c.name} fecha em breve`, body: `Fecha em ${br(i.closingDate)}.`, dedupeKey: `inv-close:${i.id}` });
    if (due >= today && due <= addDays(today, lead)) drafts.push({ type: "INVOICE_DUE", title: `Fatura ${c.name} vence em breve`, body: `${formatBRL(i.remaining)} até ${br(i.dueDate)}.`, dedupeKey: `inv-due:${i.id}` });
    if (due < today) drafts.push({ type: "OVERDUE", title: `Fatura ${c.name} atrasada`, body: `${formatBRL(i.remaining)} venceu em ${br(i.dueDate)}.`, dedupeKey: `inv-over:${i.id}` });
  }

  const key = monthKey(today);
  for (const b of (await budgetOverview(key)).items) {
    const top = b.crossed[b.crossed.length - 1];
    if (top) drafts.push({ type: "BUDGET", title: top >= 100 ? `Orçamento de ${b.category} atingido` : `${b.category}: ${top}% do orçamento`, body: `Gasto ${formatBRL(b.spent)} de ${formatBRL(b.limit)} neste mês.`, dedupeKey: `budget:${b.id}:${key}:${top}` });
  }

  for (const g of (await goalsOverview(today)).items) {
    if (g.percent < 100 && (g.daysSinceLastEntry ?? 999) > 30) drafts.push({ type: "GOAL_STALLED", title: `Meta "${g.name}" sem progresso`, body: "Nenhum aporte nos últimos 30 dias.", dedupeKey: `goal:${g.id}:${key}` });
  }

  const prev = monthKey(addMonths(monthRange(key).start, -1));
  const s = await monthSummary(prev);
  if (s.income + s.expense > 0) drafts.push({ type: "MONTHLY_SUMMARY", title: `Resumo de ${prev.split("-").reverse().join("/")}`, body: `Receitas ${formatBRL(s.income)}, despesas ${formatBRL(s.expense)}, resultado ${formatBRL(s.result)}.`, dedupeKey: `summary:${prev}` });

  const allowed = drafts.filter((x) => !prefs.disabled?.includes(x.type));
  const r = await prisma.notification.createMany({ data: allowed, skipDuplicates: true });
  return { created: r.count };
}

export const unreadCount = () => prisma.notification.count({ where: { readAt: null } });
export const listNotifications = () => prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
export const markAllRead = () => prisma.notification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
