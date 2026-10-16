import type { NotificationType, PushKind, PushSlot } from "@prisma/client";
import { pluggyConfigured, syncLink } from "./pluggy";
import { prisma, prismaRaw, currentProfile, runAs } from "../db";
import { readPrefs, prefsKey, type PushPrefs } from "../push-prefs";
import { pushConfigured, sendToAll } from "../push";
import { ensureDailyMessage } from "./daily";
import { generateCelebrations, generateNotifications } from "./notifications";
import { generateRecurring } from "./recurring";
import { personalMessages } from "@/domain/messages-personal";
import { personalStats } from "./personal";
import { INVEST_EXTRA_MESSAGES, MOTIVATION_EXTRA_MESSAGES, SPEND_EXTRA_MESSAGES } from "@/domain/messages-extra";
import { MESSAGES, messageForDay, pickMessage, stripEmoji, styleMessage } from "@/domain/messages";
import { INVEST_MESSAGES } from "@/domain/messages-invest";
import { MOTIVATION_MESSAGES } from "@/domain/messages-motivation";
import { localInstant, localParts, parseHHMM, randomMinutes } from "@/domain/schedule";
import { parseISODate } from "@/domain/dates";

/** Um horário sorteado que passou mais que isso do momento (agendador parado) não é enviado: evita mensagem fora de hora. */
const MAX_LATE_MS = 2 * 3_600_000;
const MORNING_GAP_MIN = 30; // depois da mensagem da manhã, o 1º sorteio só a partir de +30 min

// Bancos de mensagens do dia (as antigas + as novas). A mensagem da manhã continua usando só o banco original (ordem estável).
const SPEND_POOL: readonly string[] = [...MESSAGES, ...SPEND_EXTRA_MESSAGES];
const INVEST_POOL: readonly string[] = [...INVEST_MESSAGES, ...INVEST_EXTRA_MESSAGES];
const MOTIVATION_POOL: readonly string[] = [...MOTIVATION_MESSAGES, ...MOTIVATION_EXTRA_MESSAGES];
const COUNTER_STRIDE = 1000; // até 100 mensagens por dia sem repetir o contador de um dia no seguinte

const dayNumber = (day: string) => Math.floor(parseISODate(day).getTime() / 86_400_000);

/**
 * Garante os horários do dia. Sorteio determinístico (mesma preferência + mesmo dia = mesmos horários),
 * gravado no banco: tick repetido nunca duplica. Se as preferências mudarem, os ainda NÃO enviados são
 * sorteados de novo (o que já foi enviado conta no limite do dia).
 */
export async function ensureSchedule(now: Date, prefs: PushPrefs): Promise<PushSlot[]> {
  const { day, minutes } = localParts(now);
  const key = prefsKey(prefs);
  const existing = await prisma.pushSlot.findMany({ where: { day }, orderBy: { slot: "asc" } });
  const stale = existing.some((s) => !s.sentAt && !s.skipped && s.prefsKey !== key);
  if (existing.length > 0 && !stale) return existing;

  const used = existing.filter((s) => s.sentAt || s.skipped);
  if (stale) await prisma.pushSlot.deleteMany({ where: { day, sentAt: null, skipped: false } });

  const start = parseHHMM(prefs.windowStart)!, end = parseHHMM(prefs.windowEnd)!;
  const rows: Omit<PushSlot, "id" | "createdAt" | "sentAt" | "skipped" | "userId">[] = [];
  let slot = used.reduce((m, s) => Math.max(m, s.slot), -1) + 1;

  if (prefs.morning && !used.some((s) => s.kind === "MORNING")) {
    rows.push({ day, slot: slot++, at: localInstant(day, start), kind: "MORNING", message: messageForDay(day), prefsKey: key });
  }

  const kinds: PushKind[] = [...(prefs.spend ? ["SPEND" as const] : []), ...(prefs.invest ? ["INVEST" as const] : []), ...(prefs.motivation ? ["MOTIVATION" as const] : []), ...(prefs.personal ? ["PERSONAL" as const] : [])];
  const already = used.filter((s) => s.kind !== "MORNING").length;
  const need = kinds.length === 0 ? 0 : Math.max(0, prefs.perDay - already);
  const from = Math.max(prefs.morning ? start + MORNING_GAP_MIN : start, stale || used.length ? minutes + 10 : 0);
  const mins = randomMinutes({ startMin: from, endMin: end, count: need, gapMin: prefs.minGapMinutes, seed: `${day}|${key}|${already}` });
  mins.forEach((m, i) => {
    const kind = kinds[(already + i) % kinds.length]; // alterna entre as categorias ligadas
    const bank = kind === "INVEST" ? INVEST_POOL : kind === "MOTIVATION" ? MOTIVATION_POOL : SPEND_POOL; // PERSONAL: este texto é o reserva; o definitivo é montado no envio
    rows.push({ day, slot: slot++, at: localInstant(day, m), kind, message: pickMessage(bank, dayNumber(day) * COUNTER_STRIDE + (already + i)), prefsKey: key });
  });

  if (rows.length) await prisma.pushSlot.createMany({ data: rows, skipDuplicates: true });
  return prisma.pushSlot.findMany({ where: { day }, orderBy: { slot: "asc" } });
}

const TITLES: Record<PushKind, string> = { MORNING: "🌅 Bom dia — antes de gastar", SPEND: "🛑 Antes de gastar", INVEST: "📈 Que tal investir?", MOTIVATION: "💪 Não desista", PERSONAL: "🎯 Pra você, agora" };

/** Envia os horários que já chegaram. Cada horário é "reservado" antes do envio: dois agendadores nunca enviam o mesmo duas vezes. */
export async function sendDueSlots(now: Date, prefs: PushPrefs) {
  const { day } = localParts(now);
  const due = await prisma.pushSlot.findMany({ where: { day, sentAt: null, skipped: false, at: { lte: now } }, orderBy: { at: "asc" } });
  let sent = 0, skipped = 0;
  for (const s of due) {
    if (now.getTime() - s.at.getTime() > MAX_LATE_MS) {
      await prisma.pushSlot.updateMany({ where: { id: s.id, sentAt: null, skipped: false }, data: { skipped: true } });
      skipped++; continue;
    }
    const claim = await prisma.pushSlot.updateMany({ where: { id: s.id, sentAt: null, skipped: false }, data: { sentAt: now } });
    if (claim.count !== 1) continue; // outro agendador já pegou
    let text = s.message;
    if (s.kind === "PERSONAL") {
      // Monta com os números de AGORA (compras pequenas acumuladas, ritmo do mês, dívidas). Sem dados → mantém o texto reserva.
      try {
        const lines = personalMessages(await personalStats(now));
        if (lines.length) { text = pickMessage(lines, dayNumber(s.day) * COUNTER_STRIDE + s.slot); await prisma.pushSlot.update({ where: { id: s.id }, data: { message: text } }); }
      } catch (e) { console.error("mensagem personalizada falhou", e instanceof Error ? e.name : "erro"); }
    }
    const body = styleMessage(text, prefs.emojis);
    const title = prefs.emojis ? TITLES[s.kind] : stripEmoji(TITLES[s.kind]);
    const r = await sendToAll({ title, body, url: "/?msg=1", tag: `msg-${s.day}-${s.slot}` });
    if (r.sent === 0) { await prisma.pushSlot.update({ where: { id: s.id }, data: { sentAt: null } }); continue; } // nenhum aparelho recebeu: tenta no próximo tick
    sent++;
    if (s.kind === "MORNING") await ensureDailyMessage(now);
    else await prisma.notification.createMany({ data: [{ type: "DAILY_MESSAGE", title, body, dedupeKey: `msg:${s.day}:${s.slot}`, readAt: now }], skipDuplicates: true });
  }
  return { sent, skipped };
}

const GROUPS = {
  bills: ["DUE_SOON", "OVERDUE"], invoices: ["INVOICE_CLOSING", "INVOICE_DUE"], debts: ["DEBT_DUE"], budget: ["BUDGET"], goals: ["GOAL_STALLED"], wins: ["CELEBRATION"],
} as const;

/** Avisos de vencimento etc. viram push. Vários de uma vez saem agrupados em uma só notificação. Só dentro da janela do dia. */
export async function sendAlertPushes(now: Date, prefs: PushPrefs, opts: { only?: NotificationType[] } = {}) {
  const { minutes } = localParts(now);
  if (minutes < parseHHMM(prefs.windowStart)! || minutes > parseHHMM(prefs.windowEnd)!) return { sent: 0, alerts: 0 }; // silêncio fora da janela
  const types = (Object.keys(GROUPS) as (keyof typeof GROUPS)[]).filter((g) => prefs.alerts[g]).flatMap((g) => [...GROUPS[g]]);
  if (types.length === 0) return { sent: 0, alerts: 0 };
  const wanted = opts.only ? types.filter((t) => opts.only!.includes(t)) : types;
  const pending = await prisma.notification.findMany({
    where: { pushedAt: null, type: { in: wanted }, createdAt: { gte: new Date(now.getTime() - 24 * 3_600_000) } }, orderBy: { createdAt: "asc" },
  });
  const claimed = [];
  for (const n of pending) {
    const c = await prisma.notification.updateMany({ where: { id: n.id, pushedAt: null }, data: { pushedAt: now } });
    if (c.count === 1) claimed.push(n);
  }
  if (claimed.length === 0) return { sent: 0, alerts: 0 };
  const fmt = (t: string) => (prefs.emojis ? t : stripEmoji(t));
  // Parabéns saem sozinhos (cada conquista é um momento); os avisos de vencimento saem agrupados.
  let wins = 0;
  for (const c of claimed.filter((n) => n.type === "CELEBRATION")) {
    const r = await sendToAll({ title: fmt(c.title), body: fmt(c.body), url: "/", tag: `win-${c.id}` });
    if (r.sent === 0) await prisma.notification.update({ where: { id: c.id }, data: { pushedAt: null } }); else wins++;
  }
  const rest = claimed.filter((n) => n.type !== "CELEBRATION");
  if (rest.length === 0) return { sent: wins, alerts: claimed.length };
  claimed.splice(0, claimed.length, ...rest);
  const payload = claimed.length === 1
    ? { title: fmt(claimed[0].title), body: fmt(claimed[0].body), url: "/notificacoes", tag: `alert-${claimed[0].id}` }
    : {
        title: fmt(`🔔 ${claimed.length} avisos de vencimento`),
        body: fmt(claimed.slice(0, 3).map((c) => c.title).join(" · ") + (claimed.length > 3 ? ` e mais ${claimed.length - 3}` : "")),
        url: "/notificacoes", tag: "alerts",
      };
  const r = await sendToAll(payload);
  if (r.sent === 0) await prisma.notification.updateMany({ where: { id: { in: claimed.map((c) => c.id) } }, data: { pushedAt: null } }); // ninguém recebeu: tenta de novo
  return { sent: r.sent + wins, alerts: claimed.length + wins };
}

/**
 * Chamado pelo agendador a cada poucos minutos (e 1x/dia pelo Vercel Cron).
 * Gera o que for devido (recorrências e avisos), sorteia os horários do dia e envia o que já chegou.
 */
export async function runTick(now: Date = new Date(), opts: { manual?: boolean } = {}) {
  // Execução manual (botão "Rodar agora") não conta como batimento: o status do agendador externo continua honesto.
  if (!opts.manual) await prisma.heartbeat.upsert({ where: { key: "tick" }, update: { at: now }, create: { key: "tick", at: now } });
  const profile = await currentProfile();
  const prefs = readPrefs(profile?.notifyPrefs);
  const { day } = localParts(now);
  const today = parseISODate(day);
  await generateRecurring(today);
  await generateNotifications(today);
  const slots = await ensureSchedule(now, prefs);
  if (!prefs.enabled || !pushConfigured()) return { day, slots: slots.length, sent: 0, skipped: 0, alerts: 0, push: pushConfigured() ? "desligado" : "nao-configurado" };
  const due = await sendDueSlots(now, prefs);
  const alerts = await sendAlertPushes(now, prefs);
  return { day, slots: slots.length, ...due, alerts: alerts.alerts, push: "ok" as const };
}

/** Logo após uma conquista (meta, dívida): gera o parabéns e avisa na hora, sem esperar o próximo tick. Nunca derruba a ação que o chamou. */
export async function celebrateNow(now: Date = new Date()) {
  try {
    await generateCelebrations(parseISODate(localParts(now).day), now);
    const prefs = readPrefs((await currentProfile())?.notifyPrefs);
    if (prefs.enabled && pushConfigured()) await sendAlertPushes(now, prefs, { only: ["CELEBRATION"] });
  } catch (e) {
    console.error("celebrateNow falhou", e instanceof Error ? e.name : "erro");
  }
}

/**
 * Chamado pelo agendador externo: atende CADA usuário que ativou notificações (tem inscrição push), sempre dentro
 * do contexto dele — nenhum dado cruza entre contas. Um erro em uma conta não impede as outras.
 */
export async function runTickAll(now: Date = new Date()) {
  await prismaRaw.heartbeat.upsert({ where: { key: "tick" }, update: { at: now }, create: { key: "tick", at: now } });
  const subs = await prismaRaw.pushSubscription.groupBy({ by: ["userId"] });
  const users = await prismaRaw.profile.findMany({ where: { id: { in: subs.map((x) => x.userId) }, active: true }, select: { id: true } });
  let sent = 0, alerts = 0, failed = 0;
  for (const u of users) {
    try {
      const r = await runAs(u.id, () => runTick(now, { manual: true })); // o batimento já foi registrado acima
      sent += r.sent ?? 0;
      alerts += r.alerts ?? 0;
    } catch (e) {
      failed++;
      console.error("tick falhou para um usuário", e instanceof Error ? e.name : "erro"); // sem dados financeiros nos logs
    }
  }
  // Bancos conectados (Open Finance): reconcilia a cada ~6 h como rede de segurança (o webhook da Pluggy sincroniza na hora).
  let banks = 0;
  const stale = await prismaRaw.bankLink.findMany({ where: { OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(now.getTime() - 6 * 3_600_000) } }] }, select: { id: true, userId: true, user: { select: { active: true } } } });
  for (const l of stale) {
    if (!l.user.active || !pluggyConfigured()) continue;
    try { await runAs(l.userId, () => syncLink(l.id, now)); banks++; } catch { failed++; }
  }
  return { users: users.length, sent, alerts, failed, banks };
}
