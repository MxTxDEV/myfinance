import { prisma, currentProfile } from "../db";
import { cents } from "../convert";
import { fixedOverview } from "./recurring";
import { monthSummary } from "./reports";
import { readPlanPrefs } from "./plan";
import type { PersonalStats } from "@/domain/messages-personal";
import { addMonths, addDays, daysInMonth, monthKey, monthRange, parseISODate } from "@/domain/dates";
import { localParts } from "@/domain/schedule";

export const SMALL_LIMIT = 3000; // R$ 30

/** Os números do usuário atual no momento `now` (usados nas mensagens personalizadas). Só leitura. */
export async function personalStats(now: Date): Promise<PersonalStats> {
  const { day } = localParts(now);
  const today = parseISODate(day);
  const key = monthKey(today);
  const { start } = monthRange(key);
  const weekStart = addDays(today, -6);
  const from = weekStart < start ? weekStart : start;

  const [rows, summary, prevSummary, fixed, debts, profile] = await Promise.all([
    prisma.transaction.findMany({
      where: { deletedAt: null, type: "EXPENSE", status: "SETTLED", date: { gte: from, lte: today } },
      select: { amount: true, date: true, recurringId: true, planId: true, category: { select: { name: true } } },
    }),
    monthSummary(key), monthSummary(monthKey(addMonths(today, -1))),
    fixedOverview(key, today),
    prisma.debt.findMany({ where: { archivedAt: null, balance: { gt: 0 } } }),
    currentProfile(),
  ]);

  const t = today.getTime();
  const small = (r: { amount: unknown; recurringId: string | null; planId: string | null }) => !r.recurringId && !r.planId && cents(r.amount as never) <= SMALL_LIMIT;
  const st = { today: { smallCount: 0, smallTotal: 0 }, week: { smallCount: 0, smallTotal: 0 }, month: { smallCount: 0, smallTotal: 0 } };
  const byCat = new Map<string, number>();
  for (const r of rows) {
    const a = cents(r.amount as never);
    const inMonth = r.date >= start;
    if (inMonth && !r.recurringId && !r.planId && r.category) byCat.set(r.category.name, (byCat.get(r.category.name) ?? 0) + a);
    if (!small(r)) continue;
    if (inMonth) { st.month.smallCount++; st.month.smallTotal += a; }
    if (r.date >= weekStart) { st.week.smallCount++; st.week.smallTotal += a; }
    if (r.date.getTime() === t) { st.today.smallCount++; st.today.smallTotal += a; }
  }
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  const income = summary.income > 0 ? summary.income : prevSummary.income > 0 ? prevSummary.income : (readPlanPrefs(profile?.planPrefs).income ?? 0);
  const interest = debts.reduce((s, d) => s + (d.monthlyRate ? Math.round((cents(d.balance) * Number(d.monthlyRate.toString())) / 100) : 0), 0);

  return {
    smallLimit: SMALL_LIMIT, today: st.today, week: st.week,
    month: { ...st.month, spent: summary.expense, income, day: today.getUTCDate(), daysInMonth: daysInMonth(today.getUTCFullYear(), today.getUTCMonth() + 1) },
    topCategory: top ? { name: top[0], total: top[1] } : null,
    fixedMonthly: fixed.totals.monthlyEquivalent,
    debt: { total: debts.reduce((s, d) => s + cents(d.balance), 0), monthlyInterest: interest, count: debts.length },
  };
}
