"use client";
import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { useAction } from "./form-kit";
import { runTickNow } from "@/app/(app)/actions";

function Row({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 py-1.5 text-sm">
      {ok ? <Check className="mt-0.5 size-4 shrink-0 text-income" aria-label="ok" /> : <X className="mt-0.5 size-4 shrink-0 text-expense" aria-label="pendente" />}
      <span>{children}</span>
    </li>
  );
}

/**
 * Diagnóstico de por que (não) chegam notificações sozinhas: chaves no servidor, aparelho ativado e agendador externo.
 * Inclui o endereço pronto para copiar e um botão para rodar o envio agora (teste de ponta a ponta).
 */
export function SchedulerStatus({ keysOk, devices, schedulerOk, ageLabel }: { keysOk: boolean; devices: number; schedulerOk: boolean; ageLabel: string | null }) {
  const { pending, run } = useAction();
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/api/cron/tick`;

  async function now() {
    setResult(null);
    run(async () => {
      const r = await runTickNow();
      if (r.ok) {
        const d = r.data as { sent?: number; skipped?: number; alerts?: number; slots?: number; push?: string } | undefined;
        setResult(d?.push === "nao-configurado" ? "As chaves de notificação não estão no servidor."
          : d?.push === "desligado" ? "As notificações estão pausadas no menu."
          : `Verificado: ${d?.sent ?? 0} enviada(s), ${d?.alerts ?? 0} aviso(s), ${d?.skipped ?? 0} pulada(s). ${(d?.sent ?? 0) + (d?.alerts ?? 0) === 0 ? "Nada estava na hora de sair agora." : "Veja o celular."}`);
      }
      return r;
    });
  }
  async function copy() { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sem permissão */ } }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-border">
        <Row ok={keysOk}>Chaves de notificação no servidor {keysOk ? "" : "— faltam VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY na Vercel."}</Row>
        <Row ok={devices > 0}>Aparelhos ativados: <b>{devices}</b> {devices > 0 ? "" : "— toque em “Ativar neste aparelho”."}</Row>
        <Row ok={schedulerOk}>Agendador (envia no horário certo): <b>{schedulerOk ? `ativo — ${ageLabel}` : ageLabel ? `parado — ${ageLabel}` : "nunca chamou o servidor"}</b></Row>
      </ul>

      {!schedulerOk && (
        <div className="rounded-md bg-surface-2 p-3 text-sm">
          <p className="font-semibold">Por isso nada chega sozinho.</p>
          <p className="mt-1">O celular só recebe quando o <b>servidor</b> manda a notificação. Quem manda é o agendador: um relógio externo que acorda o servidor a cada 5 minutos. Sem ele, só chegam os testes manuais — mesmo com o app fechado e o celular bloqueado (isso já funciona).</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Crie uma conta grátis em <b>cron-job.org</b> e clique em <b>Create cronjob</b>.</li>
            <li>Em URL, cole o endereço abaixo e em Schedule escolha <b>Every 5 minutes</b>.</li>
            <li>Em Advanced → Headers: nome <code>Authorization</code>, valor <code>Bearer</code> + espaço + o seu <code>CRON_SECRET</code> (o mesmo da Vercel).</li>
            <li>Salve e clique em <b>Test run</b>.</li>
          </ol>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-surface px-2 py-2 text-xs">{url || "…/api/cron/tick"}</code>
            <button onClick={copy} className="flex shrink-0 items-center gap-1 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-on-accent"><Copy className="size-4" aria-hidden />{copied ? "Copiado" : "Copiar"}</button>
          </div>
        </div>
      )}

      <button disabled={pending} onClick={now} className="rounded-md bg-surface-2 py-3 font-semibold disabled:opacity-60">{pending ? "Verificando…" : "Rodar o envio agora (teste)"}</button>
      {result && <p role="status" className="text-sm font-medium">{result}</p>}
    </div>
  );
}
