"use client";
import { useState } from "react";
import { Msg, Submit, field, useAction } from "./form-kit";
import { saveNotifyMenu } from "@/app/(app)/actions";
import type { PushPrefs } from "@/server/push-prefs";

const STAGES: [number, string][] = [[7, "7 dias antes"], [3, "3 dias antes"], [2, "2 dias antes"], [1, "1 dia antes"], [0, "No dia"]];

function Check({ checked, onChange, children, hint }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex items-start gap-3 py-1.5">
      <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="font-medium">{children}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}

/** Menu para organizar as notificações: mensagens do dia (horários aleatórios), avisos de vencimento e emojis. */
export function NotifyMenu({ initial }: { initial: PushPrefs }) {
  const { error, done, pending, run } = useAction();
  const [p, setP] = useState<PushPrefs>(initial);
  const set = <K extends keyof PushPrefs>(k: K, v: PushPrefs[K]) => setP((x) => ({ ...x, [k]: v }));
  const setAlert = (k: keyof PushPrefs["alerts"], v: boolean) => setP((x) => ({ ...x, alerts: { ...x.alerts, [k]: v } }));
  const toggleStage = (n: number, on: boolean) => setP((x) => ({ ...x, stages: on ? [...new Set([...x.stages, n])].sort((a, b) => b - a) : x.stages.filter((s) => s !== n) }));
  const total = p.perDay + (p.morning ? 1 : 0);
  const sub = "mb-1 mt-4 text-sm font-bold uppercase tracking-wide text-muted";

  return (
    <form className="flex flex-col" onSubmit={(e) => { e.preventDefault(); run(() => saveNotifyMenu(p)); }}>
      <Check checked={p.enabled} onChange={(v) => set("enabled", v)} hint="Desligue para pausar tudo (mensagens e avisos).">Receber notificações no celular</Check>

      <h3 className={sub}>Mensagens do dia</h3>
      <Check checked={p.morning} onChange={(v) => set("morning", v)} hint="Sempre no início do horário, para começar o dia pensando.">Mensagem da manhã</Check>
      <div className="grid grid-cols-2 gap-3 py-2">
        <label className="text-sm text-muted">Mensagens sorteadas por dia
          <select value={p.perDay} onChange={(e) => set("perDay", Number(e.target.value))} className={`${field} mt-1`}>
            {Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>{n === 0 ? "Nenhuma" : n}</option>)}
          </select>
        </label>
        <label className="text-sm text-muted">Intervalo mínimo
          <select value={p.minGapMinutes} onChange={(e) => set("minGapMinutes", Number(e.target.value))} className={`${field} mt-1`}>
            {[30, 60, 90, 120, 180].map((n) => <option key={n} value={n}>{n >= 60 ? `${n / 60} h` : `${n} min`}</option>)}
          </select>
        </label>
        <label className="text-sm text-muted">A partir de<input type="time" value={p.windowStart} onChange={(e) => set("windowStart", e.target.value)} className={`${field} mt-1`} /></label>
        <label className="text-sm text-muted">Até<input type="time" value={p.windowEnd} onChange={(e) => set("windowEnd", e.target.value)} className={`${field} mt-1`} /></label>
      </div>
      <p className="text-xs text-muted">Os horários são sorteados todo dia dentro dessa janela. Fora dela você não recebe nada, nem avisos. Hoje: até {total} {total === 1 ? "mensagem" : "mensagens"}.</p>
      <Check checked={p.spend} onChange={(v) => set("spend", v)} hint="Mensagens duras para frear o gasto por impulso.">Pense antes de gastar</Check>
      <Check checked={p.invest} onChange={(v) => set("invest", v)} hint="Mensagens que incentivam investir em vez de gastar.">Invista em vez de gastar</Check>
      <Check checked={p.emojis} onChange={(v) => set("emojis", v)}>Usar emojis 🔥</Check>

      <h3 className={sub}>Avisos de vencimento</h3>
      <Check checked={p.alerts.bills} onChange={(v) => setAlert("bills", v)} hint="Contas a pagar, recebimentos e atrasos.">Contas e lançamentos previstos</Check>
      <Check checked={p.alerts.invoices} onChange={(v) => setAlert("invoices", v)} hint="Fechamento e vencimento das faturas.">Faturas do cartão</Check>
      <Check checked={p.alerts.debts} onChange={(v) => setAlert("debts", v)} hint="Parcelas de financiamentos e empréstimos.">Dívidas</Check>
      <fieldset className="mt-2">
        <legend className="text-sm text-muted">Avisar</legend>
        <div className="flex flex-wrap gap-x-4">{STAGES.map(([n, l]) => <Check key={n} checked={p.stages.includes(n)} onChange={(v) => toggleStage(n, v)}>{l}</Check>)}</div>
      </fieldset>
      <h3 className={sub}>Outros avisos</h3>
      <Check checked={p.alerts.budget} onChange={(v) => setAlert("budget", v)}>Orçamento chegando no limite</Check>
      <Check checked={p.alerts.goals} onChange={(v) => setAlert("goals", v)}>Metas sem progresso</Check>
      <Check checked={p.alerts.monthlySummary} onChange={(v) => setAlert("monthlySummary", v)}>Resumo do mês</Check>

      <div className="mt-4 flex flex-col gap-3">
        {p.stages.length === 0 && <p role="alert" className="text-sm font-medium text-expense">Escolha pelo menos um momento para os avisos.</p>}
        <Msg error={error} done={done} />
        <Submit pending={pending || p.stages.length === 0}>Salvar</Submit>
      </div>
    </form>
  );
}
