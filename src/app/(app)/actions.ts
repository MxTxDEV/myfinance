"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { assertOwner, endSession } from "@/server/auth";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";
import * as tx from "@/server/services/transactions";
import * as tr from "@/server/services/transfers";
import * as acc from "@/server/services/accounts";
import * as cards from "@/server/services/cards";
import * as cat from "@/server/services/categories";
import * as rec from "@/server/services/recurring";
import { suggestions } from "@/server/services/ledger";
import * as plan from "@/server/services/planning";
import * as notif from "@/server/services/notifications";
import * as inv from "@/server/services/investments";
import * as stmt from "@/server/services/statements";
import { pushPrefsSchema } from "@/server/push-prefs";
import { celebrateNow, ensureSchedule, runTick } from "@/server/services/scheduler";
import { dismissNotification } from "@/server/services/notifications";
import { todayBR } from "@/domain/dates";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>, opts: { revalidate?: boolean } = {}): Promise<Result<T>> {
  try {
    await assertOwner();
    const data = await fn();
    if (opts.revalidate !== false) revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos" };
    console.error("action error", e instanceof Error ? e.name : "unknown"); // sem dados financeiros nos logs
    return { ok: false, error: "Não foi possível concluir. Tente novamente." };
  }
}

export async function saveTransaction(v: Parameters<typeof tx.createTransaction>[0]) { return run(async () => { await tx.createTransaction(v); }); }
export async function editTransaction(id: string, v: Parameters<typeof tx.updateTransaction>[1]) { return run(async () => { await tx.updateTransaction(id, v); }); }
export async function removeTransaction(id: string) { return run(() => tx.deleteTransaction(id)); }
export async function copyTransaction(id: string) { return run(async () => { await tx.duplicateTransaction(id, todayBR().toISOString().slice(0, 10)); }); }
export async function settle(id: string) { return run(async () => { await tx.settleTransaction(id, { date: todayBR().toISOString().slice(0, 10) }); }); }

export async function saveTransfer(v: Parameters<typeof tr.createTransfer>[0]) { return run(async () => { await tr.createTransfer(v); }); }
export async function saveAccount(v: Parameters<typeof acc.createAccount>[0]) { return run(async () => { await acc.createAccount(v); }); }
export async function archiveAccount(id: string) { return run(async () => { await acc.archiveAccount(id); }); }
export async function saveCard(v: Parameters<typeof cards.createCard>[0]) { return run(async () => { await cards.createCard(v); }); }
export async function archiveCard(id: string) { return run(async () => { await cards.archiveCard(id); }); }
export async function pay(v: Parameters<typeof cards.payInvoice>[0]) { return run(async () => { await cards.payInvoice(v); }); }
export async function saveCategory(v: Parameters<typeof cat.createCategory>[0]) { return run(async () => { await cat.createCategory(v); }); }
export async function archiveCategory(id: string) { return run(async () => { await cat.archiveCategory(id); }); }
export async function favoriteCategory(id: string) { return run(async () => { await cat.toggleFavorite(id); }); }
export async function saveRecurring(v: Parameters<typeof rec.createRecurring>[0]) { return run(async () => { await rec.createRecurring(v); await rec.generateRecurring(); }); }
export async function getSuggestions(type: "INCOME" | "EXPENSE") { return run(() => suggestions(type), { revalidate: false }); } // leitura: não revalida
export async function setHideValues(hide: boolean) { return run(async () => { const p = await assertOwner(); await prisma.profile.update({ where: { id: p.id }, data: { hideValues: hide } }); }); }
export async function setTheme(theme: "system" | "light" | "dark") { return run(async () => { const p = await assertOwner(); await prisma.profile.update({ where: { id: p.id }, data: { theme } }); }); }
export async function logout() { await endSession(); }

export async function saveBudget(v: Parameters<typeof plan.upsertBudget>[0]) { return run(async () => { await plan.upsertBudget(v); }); }
export async function removeBudget(id: string) { return run(async () => { await plan.deleteBudget(id); }); }
export async function saveGoal(v: Parameters<typeof plan.createGoal>[0]) { return run(async () => { await plan.createGoal(v); }); }
export async function saveGoalEntry(v: Parameters<typeof plan.addGoalEntry>[0]) { return run(async () => { await plan.addGoalEntry(v); await celebrateNow(); }); }
export async function removeGoal(id: string) { return run(async () => { await plan.archiveGoal(id); }); }
export async function saveDebt(v: Parameters<typeof plan.createDebt>[0]) { return run(async () => { await plan.createDebt(v); }); }
export async function saveDebtPayment(v: Parameters<typeof plan.payDebt>[0]) { return run(async () => { await plan.payDebt(v); await celebrateNow(); }); }
export async function dismissCelebration(id: string) { return run(async () => { await dismissNotification(id); }); }
export async function saveAsset(v: Parameters<typeof plan.createAsset>[0]) { return run(async () => { await plan.createAsset(v); }); }
export async function removeAsset(id: string) { return run(async () => { await plan.archiveAsset(id); }); }
export async function changeAssetValue(id: string, value: number, on: string) { return run(async () => { await plan.updateAssetValue(id, value, on); }); }
export async function pauseRecurring(id: string, active: boolean) { return run(async () => { await rec.setRecurringActive(id, active); }); }
export async function readAllNotifications() { return run(async () => { await notif.markAllRead(); }); }
export async function saveNotifyMenu(v: unknown) {
  return run(async () => {
    const owner = await assertOwner();
    const prefs = pushPrefsSchema.parse(v);
    const current = (owner.notifyPrefs && typeof owner.notifyPrefs === "object" ? owner.notifyPrefs : {}) as Record<string, unknown>;
    await prisma.profile.update({ where: { id: owner.id }, data: { notifyPrefs: { ...current, menu: prefs } } });
    await ensureSchedule(new Date(), prefs); // reflete já na lista "Hoje"
  });
}
export async function editTransfer(id: string, v: Parameters<typeof tr.updateTransfer>[1]) { return run(async () => { await tr.updateTransfer(id, v); }); }

export async function saveInvestment(v: Parameters<typeof inv.createInvestment>[0]) { return run(async () => { await inv.createInvestment(v); }); }
export async function investContribute(v: Parameters<typeof inv.contribute>[0]) { return run(async () => { await inv.contribute(v); }); }
export async function investWithdraw(v: Parameters<typeof inv.withdraw>[0]) { return run(async () => { await inv.withdraw(v); }); }
export async function investValue(v: Parameters<typeof inv.updateInvestmentValue>[0]) { return run(async () => { await inv.updateInvestmentValue(v); }); }
export async function removeInvestment(id: string) { return run(async () => { await inv.archiveInvestment(id); }); }
export async function editRecurring(id: string, v: Parameters<typeof rec.updateRecurring>[1]) { return run(async () => { await rec.updateRecurring(id, v); }); }
export async function stopRecurring(id: string) { return run(() => rec.endRecurring(id)); }
export async function runTickNow() { return run(() => runTick(new Date(), { manual: true })); }

export async function previewStatement(v: Parameters<typeof stmt.previewStatement>[0]) { return run(() => stmt.previewStatement(v), { revalidate: false }); }
export async function commitStatement(v: Parameters<typeof stmt.commitStatement>[0]) { return run(() => stmt.commitStatement(v)); }
