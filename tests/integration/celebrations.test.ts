import { afterEach, beforeEach, describe, expect, it } from "vitest";
import webpush from "web-push";
import { prisma } from "@/server/db";
import { resetDb, seedBasics, setPrefs } from "./helpers";
import { setPushSender } from "@/server/push";
import { celebrateNow, sendAlertPushes } from "@/server/services/scheduler";
import { generateNotifications, recentCelebrations } from "@/server/services/notifications";
import { addGoalEntry, createDebt, createGoal, payDebt, upsertBudget } from "@/server/services/planning";
import { createTransaction } from "@/server/services/transactions";
import { DEFAULT_PREFS } from "@/server/push-prefs";
import { localInstant } from "@/domain/schedule";
import { d } from "@/domain/dates";

let s: Awaited<ReturnType<typeof seedBasics>>;
const sent: { title: string; body: string; tag?: string }[] = [];
const today = d(2026, 10, 16);
const noon = () => localInstant("2026-10-16", 12 * 60);
const celebrations = () => prisma.notification.findMany({ where: { type: "CELEBRATION" }, orderBy: { dedupeKey: "asc" } });

beforeEach(async () => {
  await resetDb(); s = await seedBasics(); sent.length = 0;
  const k = webpush.generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = k.publicKey; process.env.VAPID_PRIVATE_KEY = k.privateKey;
  await prisma.pushSubscription.create({ data: { endpoint: "https://push.example/abc", p256dh: "x".repeat(20), auth: "y".repeat(10) } });
  setPushSender(async (_s, payload) => { sent.push(JSON.parse(payload)); });
});
afterEach(() => { setPushSender(null); delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; });

describe("parabéns por conquistas", () => {
  it("meta: marcos de 50% e 75% e conclusão, cada um uma única vez", async () => {
    const g = await createGoal({ name: "Reserva", targetAmount: 100000, priority: 1 });
    await addGoalEntry({ goalId: g.id, amount: 40000, date: "2026-10-10" });
    await generateNotifications(today);
    expect(await celebrations()).toHaveLength(0); // 40%: ainda nada
    await addGoalEntry({ goalId: g.id, amount: 15000, date: "2026-10-11" }); // 55%
    await generateNotifications(today); await generateNotifications(today);
    expect((await celebrations()).map((n) => n.dedupeKey)).toEqual([`goal-ms:${g.id}:50`]);
    await addGoalEntry({ goalId: g.id, amount: 25000, date: "2026-10-12" }); // 80%
    await generateNotifications(today);
    await addGoalEntry({ goalId: g.id, amount: 20000, date: "2026-10-13" }); // 100%
    await generateNotifications(today); await generateNotifications(today);
    const keys = (await celebrations()).map((n) => n.dedupeKey);
    expect(keys).toEqual([`goal-done:${g.id}`, `goal-ms:${g.id}:50`, `goal-ms:${g.id}:75`]);
    const done = (await celebrations()).find((n) => n.dedupeKey.startsWith("goal-done"))!;
    expect(done.title).toMatch(/PARABÉNS|Meta batida|conseguiu/i); expect(done.body).toContain("Reserva");
  });
  it("dívida quitada gera parabéns uma vez (e só depois de ter pago algo)", async () => {
    const x = await createDebt({ name: "Empréstimo", originalAmount: 100000, balance: 0 });
    await generateNotifications(today);
    expect(await celebrations()).toHaveLength(0); // saldo zero sem nenhum pagamento: não é conquista
    const y = await createDebt({ name: "Financiamento", originalAmount: 100000, balance: 50000 });
    await payDebt({ debtId: y.id, amount: 50000, date: "2026-10-14", accountId: s.bank.id });
    await generateNotifications(today); await generateNotifications(today);
    const c = await celebrations();
    expect(c.map((n) => n.dedupeKey)).toEqual([`debt-paid:${y.id}`]);
    expect(c[0].title).toContain("QUITADA"); void x;
  });
  it("mês anterior no azul e orçamentos respeitados", async () => {
    await createTransaction({ type: "INCOME", amount: 500000, description: "Salário", date: "2026-09-05", categoryId: s.salary.id, accountId: s.bank.id, status: "SETTLED", installments: 1 });
    await createTransaction({ type: "EXPENSE", amount: 300000, description: "Vida", date: "2026-09-10", categoryId: s.food.id, accountId: s.bank.id, status: "SETTLED", installments: 1 });
    await upsertBudget({ categoryId: s.food.id, limit: 350000, alertAt: [80] });
    await generateNotifications(today);
    const keys = (await celebrations()).map((n) => n.dedupeKey);
    expect(keys).toEqual(["budget-win:2026-09", "win:2026-09"]);
    const win = (await celebrations()).find((n) => n.dedupeKey === "win:2026-09")!;
    expect(win.body).toContain("40%"); // poupou 40% da renda
  });
  it("mês no vermelho ou orçamento estourado não comemora", async () => {
    await createTransaction({ type: "INCOME", amount: 100000, description: "Salário", date: "2026-09-05", categoryId: s.salary.id, accountId: s.bank.id, status: "SETTLED", installments: 1 });
    await createTransaction({ type: "EXPENSE", amount: 150000, description: "Vida", date: "2026-09-10", categoryId: s.food.id, accountId: s.bank.id, status: "SETTLED", installments: 1 });
    await upsertBudget({ categoryId: s.food.id, limit: 100000, alertAt: [80] });
    await generateNotifications(today);
    expect(await celebrations()).toHaveLength(0);
  });
  it("pode ser desligado no menu", async () => {
    await setPrefs({ menu: { alerts: { wins: false } } });
    const g = await createGoal({ name: "Reserva", targetAmount: 1000, priority: 1 });
    await addGoalEntry({ goalId: g.id, amount: 1000, date: "2026-10-10" });
    await generateNotifications(today);
    expect(await celebrations()).toHaveLength(0);
  });
});

describe("push de parabéns", () => {
  it("avisa na hora ao concluir a meta, sozinho (não agrupado com vencimentos) e sem repetir", async () => {
    const g = await createGoal({ name: "Reserva", targetAmount: 1000, priority: 1 });
    await addGoalEntry({ goalId: g.id, amount: 1000, date: "2026-10-10" });
    await celebrateNow(noon());
    await celebrateNow(noon());
    const wins = sent.filter((x) => x.tag?.startsWith("win-"));
    expect(wins.length).toBeGreaterThanOrEqual(1);
    expect(wins.some((w) => w.body.includes("Reserva"))).toBe(true);
    const total = sent.length;
    await celebrateNow(noon());
    expect(sent).toHaveLength(total); // nada reenviado
    expect((await recentCelebrations(new Date())).length).toBeGreaterThanOrEqual(0);
  });
  it("parabéns e vencimentos saem em notificações separadas", async () => {
    await createTransaction({ type: "EXPENSE", amount: 10000, description: "Luz", date: "2026-10-16", categoryId: s.food.id, accountId: s.bank.id, status: "PLANNED", installments: 1 });
    const g = await createGoal({ name: "Viagem", targetAmount: 1000, priority: 1 });
    await addGoalEntry({ goalId: g.id, amount: 1000, date: "2026-10-10" });
    await generateNotifications(today);
    await prisma.notification.updateMany({ data: { createdAt: new Date(noon().getTime() - 60_000) } });
    await sendAlertPushes(noon(), DEFAULT_PREFS);
    expect(sent.some((x) => x.tag?.startsWith("win-") && x.body.includes("Viagem"))).toBe(true);
    expect(sent.some((x) => x.tag?.startsWith("alert-") && x.body.includes("Luz"))).toBe(true);
    expect(sent.filter((x) => x.title.includes("avisos de vencimento"))).toHaveLength(0);
  });
});
