import { requireOwner } from "@/server/auth";
import { prisma } from "@/server/db";
import { generateNotifications, listNotifications } from "@/server/services/notifications";
import { ensureSchedule } from "@/server/services/scheduler";
import { readPrefs } from "@/server/push-prefs";
import { localParts, formatHHMM } from "@/domain/schedule";
import { styleMessage } from "@/domain/messages";
import { Card, Empty } from "@/components/ui";
import { NotifyMenu } from "@/components/notify-menu";
import { PushSettings } from "@/components/daily-message";
import { MarkRead } from "./mark-read";

const KIND = { MORNING: "🌅 Manhã", SPEND: "🛑 Pensar antes de gastar", INVEST: "📈 Investir" } as const;

export default async function Notificacoes() {
  const owner = await requireOwner();
  const now = new Date();
  const prefs = readPrefs(owner.notifyPrefs);
  await generateNotifications();
  const [items, slots, beat] = await Promise.all([listNotifications(), ensureSchedule(now, prefs), prisma.heartbeat.findUnique({ where: { key: "tick" } })]);
  const ageMin = beat ? Math.round((now.getTime() - beat.at.getTime()) / 60_000) : null;
  const schedulerOk = ageMin !== null && ageMin <= 30;
  const fmt = (t: string) => (prefs.emojis ? t : t.replace(/\p{Extended_Pictographic}️?/gu, "").trim());

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Notificações</h1>{items.some((i) => !i.readAt) && <MarkRead />}</div>

      <Card title="Neste aparelho"><PushSettings publicKey={process.env.VAPID_PUBLIC_KEY ?? null} /></Card>

      <Card title="Hoje">
        {!prefs.enabled ? <Empty title="Notificações pausadas" hint="Ative no menu abaixo." /> : slots.length === 0 ? <Empty title="Nada programado para hoje" hint="Aumente o número de mensagens ou a janela de horário no menu abaixo." /> : (
          <ul className="divide-y divide-border text-sm">
            {slots.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-semibold">{KIND[s.kind]}</p>
                  {(s.sentAt || s.skipped) && <p className="text-muted">{s.skipped ? "Não enviada (fora de hora)" : styleMessage(s.message, prefs.emojis)}</p>}
                </div>
                <span className={`shrink-0 font-bold tabular-nums ${s.sentAt ? "text-income" : "text-text"}`}>{formatHHMM(localParts(s.at).minutes)}{s.sentAt ? " ✓" : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Os horários são sorteados dentro da sua janela e a mensagem só aparece aqui depois de enviada.</p>
      </Card>

      <Card title="Organizar notificações"><NotifyMenu initial={prefs} /></Card>

      <Card title="Agendador">
        <p role="status" className={`text-sm font-medium ${schedulerOk ? "text-income" : "text-expense"}`}>
          {schedulerOk ? `Ativo — última verificação há ${ageMin} min.` : beat ? `Parado — última verificação há ${ageMin! >= 120 ? `${Math.round(ageMin! / 60)} h` : `${ageMin} min`}.` : "Ainda não chamou o servidor."}
        </p>
        {!schedulerOk && <p className="mt-1 text-sm text-muted">Para as mensagens chegarem em horários aleatórios, um agendador gratuito (cron-job.org) precisa chamar o servidor a cada 5 minutos. Veja o passo a passo no README, seção “Mensagens e avisos”.</p>}
      </Card>

      {items.length === 0 ? <Card><Empty title="Tudo em dia" hint="Avisos de vencimentos, orçamentos e metas aparecem aqui." /></Card> : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface px-4">
          {items.map((n) => (
            <li key={n.id} className="py-3">
              <p className={`font-semibold ${n.readAt ? "text-muted" : ""}`}>{!n.readAt && <><span aria-hidden className="mr-2 inline-block size-2 rounded-full bg-accent" /><span className="sr-only">Não lida: </span></>}{fmt(n.title)}</p>
              <p className="text-sm text-muted">{fmt(n.body)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
