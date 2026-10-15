import webpush from "web-push";
import { prisma } from "./db";

export interface PushPayload { title: string; body: string; url?: string; tag?: string }
type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;

const realSender: Sender = (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 6 * 3600, urgency: "high" });
let sender: Sender = realSender;
/** Somente testes: troca o envio real (rede) por um falso. */
export function setPushSender(s: Sender | null) { sender = s ?? realSender; }

export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Envia para todos os aparelhos cadastrados (ou só os do `endpoint`). Remove aparelhos que não existem mais. */
export async function sendToAll(payload: PushPayload, opts: { endpoint?: string } = {}): Promise<{ sent: number; devices: number }> {
  if (!pushConfigured()) return { sent: 0, devices: 0 };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const subs = await prisma.pushSubscription.findMany({ where: opts.endpoint ? { endpoint: opts.endpoint } : {} });
  let sent = 0;
  for (const s of subs) {
    try {
      await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {}); // aparelho desinstalou
      else console.error("push falhou", code ?? "erro");
    }
  }
  return { sent, devices: subs.length };
}
