import { requireOwner } from "@/server/auth";
import { generateNotifications, listNotifications } from "@/server/services/notifications";
import { Card, Empty } from "@/components/ui";
import { NotifyPrefsForm } from "../planejamento/forms";
import { MarkRead } from "./mark-read";

export default async function Notificacoes() {
  const owner = await requireOwner();
  await generateNotifications();
  const items = await listNotifications();
  const prefs = owner.notifyPrefs as { disabled?: string[]; leadDays?: number };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Notificações</h1>{items.some((i) => !i.readAt) && <MarkRead />}</div>
      {items.length === 0 ? <Card><Empty title="Tudo em dia" hint="Avisos de vencimentos, orçamentos e metas aparecem aqui." /></Card> : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface px-4">
          {items.map((n) => (
            <li key={n.id} className="py-3">
              <p className={`font-semibold ${n.readAt ? "text-muted" : ""}`}>{!n.readAt && <><span aria-hidden className="mr-2 inline-block size-2 rounded-full bg-accent" /><span className="sr-only">Não lida: </span></>}{n.title}</p>
              <p className="text-sm text-muted">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
      <details className="rounded-md border border-border bg-surface"><summary className="flex cursor-pointer items-center justify-between p-4 font-bold">Preferências</summary>
        <div className="p-4 pt-0"><NotifyPrefsForm disabled={prefs.disabled ?? []} leadDays={prefs.leadDays ?? 3} /></div></details>
    </div>
  );
}
