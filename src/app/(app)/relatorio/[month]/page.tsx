import { notFound } from "next/navigation";
import { requireOwner } from "@/server/auth";
import { prisma } from "@/server/db";
import { fixedVsVariable, monthSummary } from "@/server/services/reports";
import { budgetOverview, netWorthOverview } from "@/server/services/planning";
import { formatBRL } from "@/domain/money";
import { PrintButton } from "./print-button";

export default async function Relatorio({ params }: { params: Promise<{ month: string }> }) {
  const owner = await requireOwner();
  const { month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  const [s, fv, b, nw, cats] = await Promise.all([monthSummary(month), fixedVsVariable(month), budgetOverview(month), netWorthOverview(), prisma.category.findMany()]);
  const title = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month + "-01T12:00:00Z"));
  const row = "flex justify-between border-b border-border py-1.5";
  return (
    <article className="mx-auto max-w-2xl bg-surface p-6 print:p-0">
      <div className="mb-4 flex items-start justify-between"><div><h1 className="text-2xl font-bold capitalize">Resumo de {title}</h1><p className="text-sm text-muted">{owner.name}</p></div><PrintButton /></div>
      <h2 className="mt-4 font-bold">Resultado</h2>
      <div className={row}><span>Receitas recebidas</span><b>{formatBRL(s.income)}</b></div>
      <div className={row}><span>Despesas pagas</span><b>{formatBRL(s.expense)}</b></div>
      <div className={row}><span>Resultado</span><b>{formatBRL(s.result)}</b></div>
      <div className={row}><span>Taxa de poupança</span><b>{s.savingsRate === null ? "Não disponível" : `${s.savingsRate}%`}</b></div>
      <div className={row}><span>Despesas fixas / variáveis</span><b>{formatBRL(fv.fixed)} / {formatBRL(fv.variable)}</b></div>
      <h2 className="mt-6 font-bold">Gastos por categoria</h2>
      {s.byCategory.map((c) => <div key={c.categoryId} className={row}><span>{cats.find((x) => x.id === c.categoryId)?.name}</span><b>{formatBRL(c.total)}</b></div>)}
      {b.items.length > 0 && <><h2 className="mt-6 font-bold">Orçamentos</h2>
        {b.items.map((x) => <div key={x.id} className={row}><span>{x.category}</span><b>{formatBRL(x.spent)} / {formatBRL(x.limit)} ({x.usedPercent}%)</b></div>)}</>}
      <h2 className="mt-6 font-bold">Patrimônio líquido (hoje)</h2>
      <div className={row}><span>Ativos</span><b>{formatBRL(nw.assets)}</b></div>
      <div className={row}><span>Obrigações</span><b>{formatBRL(nw.liabilities)}</b></div>
      <div className={row}><span>Líquido</span><b>{formatBRL(nw.net)}</b></div>
    </article>
  );
}
