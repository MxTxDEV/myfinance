import webpush from "web-push";
import { prisma } from "../db";
import { messageDayKey, messageForDay } from "@/domain/messages";

export const DAILY_TITLE = "Antes de gastar hoje";

/** Garante que a mensagem do dia exista na caixa de notificações (idempotente). */
export async function ensureDailyMessage(now: Date = new Date()) {
  const day = messageDayKey(now);
  const text = messageForDay(day);
  await prisma.notification.createMany({
    data: [{ type: "DAILY_MESSAGE", title: DAILY_TITLE, body: text, dedupeKey: `daily:${day}` }],
    skipDuplicates: true,
  });
  return { day, text };
}

export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configure() {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

async function sendTo(subs: Sub[], payload: object) {
  configure();
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {}); // aparelho desinstalou
      else console.error("push falhou", code ?? "erro");
    }
  }
  return sent;
}

/**
 * Envio das 06:00. Idempotente por dia (PushDelivery): o Vercel Cron e um agendador externo
 * podem apontar para a mesma rota sem enviar duas vezes.
 */
export async function sendDailyPush(now: Date = new Date(), opts: { force?: boolean } = {}) {
  const { day, text } = await ensureDailyMessage(now);
  if (!pushConfigured()) return { day, sent: 0, skipped: "push-nao-configurado" as const };
  if (!opts.force) {
    try { await prisma.pushDelivery.create({ data: { day } }); }
    catch { return { day, sent: 0, skipped: "ja-enviado" as const }; }
  }
  const subs = await prisma.pushSubscription.findMany();
  const sent = await sendTo(subs, { title: DAILY_TITLE, body: text, url: "/?msg=1" });
  if (!opts.force) await prisma.pushDelivery.update({ where: { day }, data: { count: sent } });
  return { day, sent };
}

/** Teste: manda a mensagem de hoje só para um aparelho (o que pediu). */
export async function sendTestPush(endpoint: string, now: Date = new Date()) {
  if (!pushConfigured()) return { sent: 0, skipped: "push-nao-configurado" as const };
  const { text } = await ensureDailyMessage(now);
  const subs = await prisma.pushSubscription.findMany({ where: { endpoint } });
  return { sent: await sendTo(subs, { title: DAILY_TITLE, body: text, url: "/?msg=1" }) };
}
