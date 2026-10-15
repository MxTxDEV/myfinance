import { prisma } from "../db";
import { messageDayKey, messageForDay, MESSAGES, pickMessage, styleMessage } from "@/domain/messages";
import { INVEST_MESSAGES } from "@/domain/messages-invest";
import { pushConfigured, sendToAll } from "../push";
import { readPrefs } from "../push-prefs";

export const DAILY_TITLE = "Antes de gastar hoje";
export { pushConfigured };

/** Garante que a mensagem da manhã exista na caixa de notificações (idempotente). */
export async function ensureDailyMessage(now: Date = new Date()) {
  const day = messageDayKey(now);
  const text = messageForDay(day);
  await prisma.notification.createMany({
    data: [{ type: "DAILY_MESSAGE", title: DAILY_TITLE, body: text, dedupeKey: `daily:${day}` }],
    skipDuplicates: true,
  });
  return { day, text };
}

/** Teste de envio só para o aparelho que pediu: mensagem de gastar, de investir ou aviso de vencimento. */
export async function sendTestPush(endpoint: string, kind: "spend" | "invest" | "bill" = "spend", now: Date = new Date()) {
  if (!pushConfigured()) return { sent: 0, skipped: "push-nao-configurado" as const };
  const prefs = readPrefs((await prisma.profile.findFirst())?.notifyPrefs);
  const n = Math.floor(now.getTime() / 60_000); // varia a cada minuto
  const e = prefs.emojis;
  const payload =
    kind === "invest" ? { title: e ? "📈 Que tal investir?" : "Que tal investir?", body: styleMessage(pickMessage(INVEST_MESSAGES, n), e), tag: "teste" }
    : kind === "bill" ? { title: e ? "🔔 Teste: conta vence amanhã" : "Teste: conta vence amanhã", body: "Exemplo: Internet — R$ 104,00. É assim que os avisos de vencimento chegam.", tag: "teste", url: "/notificacoes" }
    : { title: e ? "🛑 Antes de gastar" : "Antes de gastar", body: styleMessage(pickMessage(MESSAGES, n), e), tag: "teste" };
  const r = await sendToAll({ ...payload, url: payload.url ?? "/?msg=1" }, { endpoint });
  return { sent: r.sent };
}
