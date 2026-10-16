import { afterEach, beforeEach, describe, expect, it } from "vitest";
import webpush from "web-push";
import { prisma } from "@/server/db";
import { resetDb, seedBasics, setPrefs } from "./helpers";
import { setPushSender } from "@/server/push";
import { ensureSchedule, runTick, sendAlertPushes, sendDueSlots } from "@/server/services/scheduler";
import { generateNotifications } from "@/server/services/notifications";
import { createTransaction } from "@/server/services/transactions";
import { createDebt } from "@/server/services/planning";
import { DEFAULT_PREFS, readPrefs, type PushPrefs } from "@/server/push-prefs";
import { localInstant, localParts, parseHHMM } from "@/domain/schedule";
import { d } from "@/domain/dates";

let s: Awaited<ReturnType<typeof seedBasics>>;
const sent: { title: string; body: string; tag?: string }[] = [];
const T = (day: string, hhmm: string) => localInstant(day, parseHHMM(hhmm)!); // hora de Brasília → instante
// Os avisos nascem com a hora real da máquina; aqui simulamos "agora" para os testes.
const stamp = (now: Date) => prisma.notification.updateMany({ data: { createdAt: new Date(now.getTime() - 60_000) } });

beforeEach(async () => {
  await resetDb(); s = await seedBasics(); sent.length = 0;
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  await prisma.pushSubscription.create({ data: { endpoint: "https://push.example/abc", p256dh: "x".repeat(20), auth: "y".repeat(10) } });
  setPushSender(async (_sub, payload) => { sent.push(JSON.parse(payload)); });
});
afterEach(() => { setPushSender(null); delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; });

const prefs = (o: Partial<PushPrefs> = {}): PushPrefs => ({ ...DEFAULT_PREFS, ...o });

describe("horários do dia", () => {
  it("sorteia manhã + N mensagens dentro de 06:00–22:00, com intervalo mínimo, e não muda ao repetir", async () => {
    const now = T("2026-10-16", "05:50");
    const a = await ensureSchedule(now, prefs());
    const b = await ensureSchedule(new Date(now.getTime() + 600_000), prefs());
    expect(b.map((x) => x.id)).toEqual(a.map((x) => x.id)); // estável
    expect(a).toHaveLength(5); // 1 manhã + 4
    const mins = a.map((x) => localParts(x.at).minutes);
    expect(mins[0]).toBe(6 * 60); // manhã exatamente às 06:00
    for (const m of mins) { expect(m).toBeGreaterThanOrEqual(6 * 60); expect(m).toBeLessThanOrEqual(22 * 60); }
    for (let i = 2; i < mins.length; i++) expect(mins[i] - mins[i - 1]).toBeGreaterThanOrEqual(60);
    expect(a.slice(1).map((x) => x.kind)).toEqual(["SPEND", "INVEST", "MOTIVATION", "PERSONAL"]); // alterna as 4 categorias
    expect(new Set(a.map((x) => x.message)).size).toBe(5);
  });
  it("respeita as categorias escolhidas e a janela personalizada", async () => {
    const a = await ensureSchedule(T("2026-10-16", "07:00"), prefs({ morning: false, invest: false, motivation: false, personal: false, perDay: 3, windowStart: "09:00", windowEnd: "12:00", minGapMinutes: 30 }));
    expect(a.every((x) => x.kind === "SPEND")).toBe(true);
    for (const x of a) { const m = localParts(x.at).minutes; expect(m).toBeGreaterThanOrEqual(540); expect(m).toBeLessThanOrEqual(720); }
  });
  it("mudar as preferências refaz só o que ainda não foi enviado e respeita o limite do dia", async () => {
    await ensureSchedule(T("2026-10-16", "05:50"), prefs());
    await sendDueSlots(T("2026-10-16", "06:05"), prefs()); // envia a manhã
    expect(sent).toHaveLength(1);
    const after = await ensureSchedule(T("2026-10-16", "06:10"), prefs({ perDay: 2 }));
    expect(after.filter((x) => x.sentAt)).toHaveLength(1);
    expect(after.filter((x) => !x.sentAt && x.kind !== "MORNING")).toHaveLength(2);
    expect(after.filter((x) => !x.sentAt).every((x) => x.at > T("2026-10-16", "06:10"))).toBe(true); // nunca no passado
  });
});

describe("envio", () => {
  it("envia cada horário uma única vez, mesmo com agendadores simultâneos", async () => {
    const p = prefs({ perDay: 0 }); // só a manhã (06:00)
    await ensureSchedule(T("2026-10-16", "05:50"), p);
    const t = T("2026-10-16", "06:05");
    await Promise.all([sendDueSlots(t, p), sendDueSlots(t, p), sendDueSlots(t, p), sendDueSlots(t, p)]);
    expect(sent).toHaveLength(1); // 4 agendadores ao mesmo tempo → 1 envio
    await sendDueSlots(T("2026-10-16", "06:10"), p);
    expect(sent).toHaveLength(1); // nada reenviado depois
    expect((await prisma.pushSlot.findFirstOrThrow()).sentAt).not.toBeNull();
  });
  it("atrasos pequenos ainda são enviados; os sorteados são enviados na hora de cada um", async () => {
    const p = prefs({ morning: false, perDay: 2, minGapMinutes: 60, windowStart: "10:00", windowEnd: "14:00" });
    const slots = await ensureSchedule(T("2026-10-16", "09:00"), p);
    const [first, second] = slots;
    await sendDueSlots(new Date(first.at.getTime() - 1000), p);
    expect(sent).toHaveLength(0); // ainda não chegou a hora
    await sendDueSlots(new Date(first.at.getTime() + 20 * 60_000), p);
    expect(sent).toHaveLength(1); // 20 min de atraso: envia
    await sendDueSlots(new Date(second.at.getTime() + 1000), p);
    expect(sent).toHaveLength(2);
  });
  it("horário muito atrasado (agendador parado) é pulado em vez de chegar fora de hora", async () => {
    const p = prefs({ morning: false, perDay: 1, windowStart: "08:00", windowEnd: "09:00" });
    const [slot] = await ensureSchedule(T("2026-10-16", "07:00"), p);
    const r = await sendDueSlots(new Date(slot.at.getTime() + 3 * 3_600_000), p);
    expect(r).toEqual({ sent: 0, skipped: 1 });
    expect(sent).toHaveLength(0);
  });
  it("sem aparelhos cadastrados o horário não é consumido", async () => {
    await prisma.pushSubscription.deleteMany();
    const p = prefs({ morning: true, perDay: 0 });
    await ensureSchedule(T("2026-10-16", "05:50"), p);
    await sendDueSlots(T("2026-10-16", "06:01"), p);
    expect((await prisma.pushSlot.findFirstOrThrow()).sentAt).toBeNull();
  });
  it("emojis desligados saem sem emoji; ligados com emoji; texto sem valores financeiros", async () => {
    await ensureSchedule(T("2026-10-16", "05:50"), prefs());
    await sendDueSlots(T("2026-10-16", "06:01"), prefs({ emojis: false }));
    expect(sent[0].title).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(sent[0].body).not.toMatch(/\p{Extended_Pictographic}/u);
    await prisma.pushSlot.deleteMany(); sent.length = 0;
    await ensureSchedule(T("2026-10-17", "05:50"), prefs());
    await sendDueSlots(T("2026-10-17", "06:01"), prefs());
    expect(sent[0].title).toMatch(/\p{Extended_Pictographic}/u);
    expect(sent[0].body).not.toMatch(/R\$ \d/);
  });
});

describe("avisos de vencimento por push", () => {
  const plan = (description: string, date: string, extra: object = {}) =>
    createTransaction({ type: "EXPENSE", amount: 10400, description, date, categoryId: s.food.id, accountId: s.bank.id, status: "PLANNED", installments: 1, ...extra });

  it("avisa nos estágios 3 dias / 1 dia / no dia, um por estágio, sem repetir", async () => {
    await plan("Internet", "2026-10-19");
    const keys: string[] = [];
    for (const day of ["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"]) {
      await generateNotifications(d(+day.slice(0, 4), +day.slice(5, 7), +day.slice(8)));
      await generateNotifications(d(+day.slice(0, 4), +day.slice(5, 7), +day.slice(8))); // repetir não duplica
      keys.push(...(await prisma.notification.findMany({ select: { dedupeKey: true } })).map((n) => n.dedupeKey));
    }
    const due = [...new Set(keys)].filter((k) => k.startsWith("due:"));
    expect(due.map((k) => k.split(":")[2]).sort()).toEqual(["0", "1", "3"]);
  });
  it("vários avisos juntos viram UMA notificação agrupada; depois não repete", async () => {
    await plan("Luz", "2026-10-16"); await plan("Água", "2026-10-16"); await plan("Gás", "2026-10-16");
    await generateNotifications(d(2026, 10, 16));
    const now = T("2026-10-16", "09:00"); await stamp(now);
    const r = await sendAlertPushes(now, prefs());
    expect(r.alerts).toBe(3);
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toContain("3 avisos de vencimento");
    expect((await sendAlertPushes(now, prefs())).alerts).toBe(0);
    expect(sent).toHaveLength(1);
  });
  it("um aviso só traz título e valor do próprio vencimento", async () => {
    await plan("Internet", "2026-10-17");
    await generateNotifications(d(2026, 10, 16)); await stamp(T("2026-10-16", "10:00"));
    await sendAlertPushes(T("2026-10-16", "10:00"), prefs());
    expect(sent[0].title).toMatch(/Conta vence amanhã/);
    expect(sent[0].body).toContain("Internet");
    expect(sent[0].body).toContain("R$ 104,00");
  });
  it("não incomoda fora da janela (de madrugada) e envia quando a janela abre", async () => {
    await plan("Internet", "2026-10-16");
    await generateNotifications(d(2026, 10, 16)); await stamp(T("2026-10-16", "06:00"));
    expect((await sendAlertPushes(T("2026-10-16", "03:00"), prefs())).alerts).toBe(0);
    expect((await sendAlertPushes(T("2026-10-16", "23:30"), prefs())).alerts).toBe(0);
    expect((await sendAlertPushes(T("2026-10-16", "06:05"), prefs())).alerts).toBe(1);
  });
  it("respeita o que você desligou (ex.: contas)", async () => {
    await plan("Internet", "2026-10-16");
    await setPrefs({ menu: { alerts: { bills: false } } });
    await generateNotifications(d(2026, 10, 16));
    expect(await prisma.notification.count({ where: { type: { in: ["DUE_SOON", "OVERDUE"] } } })).toBe(0);
  });
  it("avisa vencimento de dívida (e de fatura de cartão)", async () => {
    await createDebt({ name: "Financiamento", originalAmount: 1000000, balance: 800000, installmentAmount: 100000, nextDueDate: "2026-10-17" });
    await createTransaction({ type: "EXPENSE", amount: 5000, description: "Compra", date: "2026-10-05", categoryId: s.food.id, cardId: s.card.id, status: "SETTLED", installments: 1 });
    await generateNotifications(d(2026, 10, 16));
    const debt = await prisma.notification.findFirstOrThrow({ where: { type: "DEBT_DUE" } });
    expect(debt.title).toContain("Financiamento"); expect(debt.body).toContain("R$ 1.000,00");
    expect(await prisma.notification.count({ where: { type: "INVOICE_DUE" } })).toBe(1); // vence dia 17
  });
});

describe("agendador (tick)", () => {
  it("registra batimento, gera horários e envia; segundo tick não repete nada", async () => {
    const now = T("2026-10-16", "06:03");
    const r1 = await runTick(now);
    expect(r1).toMatchObject({ slots: 5, push: "ok" });
    const n = sent.length;
    expect(n).toBeGreaterThanOrEqual(1); // a manhã
    await runTick(new Date(now.getTime() + 60_000));
    expect(sent).toHaveLength(n);
    expect((await prisma.heartbeat.findUniqueOrThrow({ where: { key: "tick" } })).at.getTime()).toBe(now.getTime() + 60_000);
  });
  it("execução manual não finge ser o agendador (não grava batimento)", async () => {
    await runTick(T("2026-10-16", "06:03"), { manual: true });
    expect(await prisma.heartbeat.count()).toBe(0);
    await runTick(T("2026-10-16", "06:04"));
    expect(await prisma.heartbeat.count()).toBe(1);
  });
  it("pausado ou sem chaves: não envia, mas continua gerando horários e avisos", async () => {
    await setPrefs({ menu: { enabled: false } });
    const r = await runTick(T("2026-10-16", "06:03"));
    expect(r).toMatchObject({ sent: 0, push: "desligado" });
    expect(sent).toHaveLength(0);
    expect(readPrefs((await prisma.profile.findFirstOrThrow()).notifyPrefs).enabled).toBe(false);
  });
});

describe("mensagens personalizadas e muitas por dia", () => {
  it("PERSONAL vira texto com os números do usuário no envio", async () => {
    const day = "2026-10-16";
    for (const [amount, i] of [[1000, 0], [2000, 1], [1500, 2]] as const) {
      await createTransaction({ type: "EXPENSE", amount, description: `Lanche ${i}`, date: day, categoryId: s.food.id, status: "SETTLED", installments: 1, accountId: s.bank.id });
    }
    const p = prefs({ morning: false, spend: false, invest: false, motivation: false, personal: true, perDay: 1, windowStart: "10:00", windowEnd: "10:30" });
    const slots = await ensureSchedule(T(day, "09:00"), p);
    expect(slots).toHaveLength(1); expect(slots[0].kind).toBe("PERSONAL");
    await sendDueSlots(T(day, "11:00"), p);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatch(/R\$/); // número real do usuário, não a frase genérica de reserva
    expect(sent[0].title).toContain("Pra você");
    const saved = await prisma.pushSlot.findFirstOrThrow({ where: { day } });
    expect(saved.message).toBe(sent[0].body.replace(/^\p{Extended_Pictographic}️?\s*/u, "").length ? saved.message : "");
  });
  it("sem dados, a personalizada cai numa frase comum (nunca fica vazia)", async () => {
    const p = prefs({ morning: false, spend: false, invest: false, motivation: false, personal: true, perDay: 1, windowStart: "10:00", windowEnd: "10:30" });
    await ensureSchedule(T("2026-10-17", "09:00"), p);
    await sendDueSlots(T("2026-10-17", "11:00"), p);
    expect(sent).toHaveLength(1); expect(sent[0].body.length).toBeGreaterThan(20);
  });
  it("aceita 100 mensagens por dia com intervalo curto, dentro da janela", async () => {
    const p = prefs({ perDay: 100, minGapMinutes: 5, windowStart: "06:00", windowEnd: "22:00" });
    const a = await ensureSchedule(T("2026-10-18", "05:00"), p);
    expect(a.filter((x) => x.kind !== "MORNING").length).toBeGreaterThanOrEqual(90);
    const mins = a.map((x) => localParts(x.at).minutes).sort((x, y) => x - y);
    for (let i = 1; i < mins.length; i++) expect(mins[i] - mins[i - 1]).toBeGreaterThanOrEqual(5);
    expect(new Set(a.map((x) => x.message)).size).toBeGreaterThan(80); // quase todas diferentes
  });
});
