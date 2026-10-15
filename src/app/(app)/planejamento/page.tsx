import Link from "next/link";
import { prisma } from "@/server/db";
import { accountBalances } from "@/server/services/accounts";
import { budgetOverview, debtsOverview, goalsOverview, netWorthOverview } from "@/server/services/planning";
import { fixedOverview, generateRecurring } from "@/server/services/recurring";
import { investmentsOverview } from "@/server/services/investments";
import { balanceProjection, fixedVsVariable, monthSummary, yearlySeries } from "@/server/services/reports";
import { listTransactions } from "@/server/services/ledger";
import { monthKey, todayBR } from "@/domain/dates";
import { formatBRL } from "@/domain/money";
import { Money } from "@/components/privacy";
import { Card, Empty, MonthNav, Progress } from "@/components/ui";
import { TxList } from "@/components/tx-list";
import { SeriesChart } from "@/components/series-chart";
import { pauseRecurring, removeAsset, removeBudget, removeGoal, removeInvestment, settle, stopRecurring } from "../actions";
import { AssetForm, BudgetForm, DebtForm, DebtPayForm, GoalEntryForm, GoalForm, INV_LABEL, InvestmentForm, InvestMoveForm, InvestValueForm, RecurringEditForm, RecurringForm, RowBtn } from "./forms";

const TABS = [["orcamentos", "Orçamentos"], ["metas", "Metas"], ["dividas", "Dívidas"], ["investimentos", "Investimentos"], ["patrimonio", "Patrimônio"], ["compromissos", "Contas fixas"], ["relatorios", "Relatórios"]] as const;
const REC: Record<string, string> = { WEEKLY: "Semanal", BIWEEKLY: "Quinzenal", MONTHLY: "Mensal", YEARLY: "Anual", CUSTOM: "Personalizado" };
const LEVEL = { ok: "accent", attention: "accent", near: "warning", over: "expense" } as const;
const ASSET: Record<string, string> = { VEHICLE: "Veículo", PROPERTY: "Imóvel", EQUIPMENT: "Equipamento", INVESTMENT: "Investimento", OTHER: "Outro" };
const det = "rounded-md border border-border bg-surface";
const sum = "flex cursor-pointer items-center justify-between p-4 font-bold";

export default async function Planejamento({ searchParams }: { searchParams: Promise<{ tab?: string; m?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? "orcamentos";
  const today = todayBR();
  const iso = today.toISOString().slice(0, 10);
  const month = sp.m && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) ? sp.m : monthKey(today);
  const [accounts, categories] = await Promise.all([accountBalances(), prisma.category.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } })]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Planejamento</h1>
      <nav aria-label="Seções" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/planejamento?tab=${k}`} aria-current={tab === k ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? "bg-accent text-on-accent" : "bg-surface-2 text-muted"}`}>{l}</Link>
        ))}
      </nav>

      {tab === "orcamentos" && <Budgets month={month} categories={categories.filter((c) => c.type === "EXPENSE")} />}
      {tab === "metas" && <Goals accounts={accounts} iso={iso} />}
      {tab === "dividas" && <Debts accounts={accounts} iso={iso} />}
      {tab === "investimentos" && <Investments accounts={accounts} iso={iso} />}
      {tab === "patrimonio" && <NetWorth iso={iso} />}
      {tab === "compromissos" && <Commitments categories={categories} accounts={accounts} iso={iso} month={month} />}
      {tab === "relatorios" && <Reports month={month} />}
    </div>
  );
}

async function Budgets({ month, categories }: { month: string; categories: { id: string; name: string }[] }) {
  const o = await budgetOverview(month);
  return (
    <>
      <MonthNav month={month} base="/planejamento?tab=orcamentos" />
      {o.items.length === 0 ? <Card><Empty title="Nenhum orçamento definido" hint="Defina um limite mensal por categoria para acompanhar seus gastos." /></Card> : (
        <ul className="flex flex-col gap-3">
          {o.items.map((b) => (
            <li key={b.id} className="rounded-md border border-border bg-surface p-4">
              <div className="flex items-center justify-between"><p className="font-bold">{b.category}</p><RowBtn label="Remover" danger confirm="Remover este orçamento?" onRun={removeBudget.bind(null, b.id)} /></div>
              <div className="my-2"><Progress value={b.usedPercent} label={`${b.category}: ${b.usedPercent}% usado`} tone={LEVEL[b.level]} /></div>
              <div className="flex justify-between text-sm"><span><Money cents={b.spent} className="font-semibold" /> de <Money cents={b.limit} /></span><span className="font-semibold">{b.usedPercent}%</span></div>
              <p className={`mt-1 text-sm ${b.remaining < 0 ? "font-semibold text-expense" : "text-muted"}`}>{b.remaining < 0 ? "Acima do limite em " : "Restam "}<Money cents={Math.abs(b.remaining)} /></p>
              <p className="mt-1 text-xs text-muted">Mês anterior: <Money cents={b.previousSpent} /> ({b.deltaVsPrevious > 0 ? "+" : b.deltaVsPrevious < 0 ? "−" : ""}<Money cents={Math.abs(b.deltaVsPrevious)} />)</p>
            </li>
          ))}
        </ul>
      )}
      {o.heavy.length > 0 && (
        <Card title="Peso na renda">
          <ul className="text-sm">{o.heavy.map((h) => <li key={h.categoryId}>{categories.find((c) => c.id === h.categoryId)?.name ?? "Categoria"} consome {h.shareOfIncome}% das receitas do mês.</li>)}</ul>
        </Card>
      )}
      <details className={det}><summary className={sum}>Definir limite</summary><div className="p-4 pt-0"><BudgetForm categories={categories} /></div></details>
    </>
  );
}

async function Goals({ accounts, iso }: { accounts: { id: string; name: string }[]; iso: string }) {
  const g = await goalsOverview();
  return (
    <>
      {g.items.length === 0 ? <Card><Empty title="Nenhuma meta ainda" hint="Crie uma meta, como uma reserva de emergência, e acompanhe o progresso." /></Card> : (
        <ul className="flex flex-col gap-3">
          {g.items.map((x) => (
            <li key={x.id} className="rounded-md border border-border bg-surface p-4">
              <div className="flex items-center justify-between"><p className="font-bold">{x.name}</p><RowBtn label="Arquivar" danger confirm="Arquivar esta meta?" onRun={removeGoal.bind(null, x.id)} /></div>
              <div className="my-2"><Progress value={x.percent} label={`${x.name}: ${x.percent}%`} tone={x.percent >= 100 ? "income" : "accent"} /></div>
              <div className="flex justify-between text-sm"><span><Money cents={x.saved} className="font-semibold" /> de <Money cents={x.target} /></span><span className="font-semibold">{x.percent}%</span></div>
              {x.monthlyNeeded !== null && x.remaining > 0 && <p className="mt-1 text-sm text-muted">Precisa guardar <Money cents={x.monthlyNeeded} className="font-semibold text-text" />/mês até {x.targetDate!.split("-").reverse().join("/")}.</p>}
              {x.feasible === false && (
                <p role="note" className="mt-2 rounded-md bg-expense-bg p-3 text-sm">
                  Com seu excedente atual ({formatBRL(Math.max(0, g.monthlySurplus))}/mês) essa meta não fecha no prazo.{" "}
                  {x.projectedMonths ? `Projeção realista: cerca de ${x.projectedMonths} meses.` : "Hoje não há excedente mensal para projetar."}
                </p>
              )}
              <details className="mt-2"><summary className="cursor-pointer py-1 font-semibold text-accent">Aporte ou retirada</summary><div className="pt-2"><GoalEntryForm goalId={x.id} today={iso} /></div></details>
            </li>
          ))}
        </ul>
      )}
      <details className={det}><summary className={sum}>Nova meta</summary><div className="p-4 pt-0"><GoalForm accounts={accounts} /></div></details>
    </>
  );
}

async function Debts({ accounts, iso }: { accounts: { id: string; name: string }[]; iso: string }) {
  const debts = await debtsOverview(10000);
  return (
    <>
      {debts.length === 0 ? <Card><Empty title="Nenhuma dívida cadastrada" hint="Cadastre financiamentos e empréstimos para acompanhar o saldo devedor." /></Card> : (
        <ul className="flex flex-col gap-3">
          {debts.map((x) => (
            <li key={x.id} className="rounded-md border border-border bg-surface p-4">
              <p className="font-bold">{x.name} <span className="text-sm font-normal text-muted">{x.creditor}</span></p>
              <p className="mt-1 text-2xl font-bold"><Money cents={x.balance} /></p>
              <div className="my-2"><Progress value={x.original ? (x.paid / x.original) * 100 : 0} label={`${x.name}: ${x.original ? Math.round((x.paid / x.original) * 100) : 0}% quitado`} tone="income" /></div>
              <p className="text-sm text-muted">Original <Money cents={x.original} /> · pago <Money cents={x.paid} />{x.nextDueDate && ` · próximo vencimento ${x.nextDueDate.split("-").reverse().join("/")}`}</p>
              {x.payoffMonths !== null && x.payoffDate && <p className="mt-1 text-sm">Quitação estimada em {x.payoffMonths} meses ({x.payoffDate.split("-").reverse().join("/")}).</p>}
              {x.simulation?.monthsSaved ? <p className="text-sm text-income">Pagando {formatBRL(10000)} a mais por mês, você economiza {x.simulation.monthsSaved} meses e {formatBRL(x.simulation.interestSaved)} de juros.</p> : null}
              {x.balance > 0 && accounts.length > 0 && <details className="mt-2"><summary className="cursor-pointer py-1 font-semibold text-accent">Registrar pagamento</summary><div className="pt-2"><DebtPayForm debtId={x.id} balance={x.balance} accounts={accounts} today={iso} /></div></details>}
            </li>
          ))}
        </ul>
      )}
      <details className={det}><summary className={sum}>Nova dívida</summary><div className="p-4 pt-0"><DebtForm /></div></details>
    </>
  );
}

async function NetWorth({ iso }: { iso: string }) {
  const n = await netWorthOverview();
  return (
    <>
      <section className="rounded-lg border border-border bg-surface p-5">
        <p className="text-sm font-medium text-muted">Patrimônio líquido</p>
        <p className="mt-1 text-4xl font-bold"><Money cents={n.net} /></p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-muted">Ativos</dt><dd className="font-semibold text-income"><Money cents={n.assets} /></dd></div><div><dt className="text-muted">Obrigações</dt><dd className="font-semibold text-expense"><Money cents={n.liabilities} /></dd></div></dl>
        <p className="mt-2 text-xs text-muted">Contas + investimentos ({formatBRL(n.investmentTotal)}) + bens − dívidas − faturas em aberto. Limite de crédito não conta.</p>
      </section>
      <Card title="Bens e investimentos">
        {n.assetItems.length === 0 ? <Empty title="Nenhum bem cadastrado" hint="Registre veículos, equipamentos ou investimentos com o valor estimado." /> : (
          <ul className="divide-y divide-border">{n.assetItems.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2.5">
              <div><p className="font-semibold">{a.name}</p><p className="text-xs text-muted">{ASSET[a.type]} · atualizado em {a.updatedAt.split("-").reverse().join("/")}</p></div>
              <div className="flex items-center"><Money cents={a.value} className="font-bold" /><RowBtn label="Remover" danger confirm="Remover este bem?" onRun={removeAsset.bind(null, a.id)} /></div>
            </li>))}</ul>
        )}
      </Card>
      <details className={det}><summary className={sum}>Novo bem</summary><div className="p-4 pt-0"><AssetForm today={iso} /></div></details>
    </>
  );
}

async function Commitments({ categories, accounts, iso, month }: { categories: { id: string; name: string; type: string }[]; accounts: { id: string; name: string }[]; iso: string; month: string }) {
  await generateRecurring();
  const [o, planned, cards] = await Promise.all([
    fixedOverview(month), listTransactions({ status: "PLANNED", sort: "date_asc" }), prisma.creditCard.findMany({ where: { archivedAt: null } }),
  ]);
  const t = o.totals;
  const br = (d: string) => d.split("-").reverse().join("/");
  const section = (type: "EXPENSE" | "INCOME", title: string) => {
    const list = o.items.filter((i) => i.type === type);
    if (list.length === 0) return null;
    return (
      <Card title={title}>
        <ul className="flex flex-col gap-3">
          {list.map((r) => (
            <li key={r.id} className={`rounded-md border p-3 ${r.active ? "border-border" : "border-dashed border-muted"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.description}</p>
                  <p className="text-xs text-muted">{REC[r.recurrence]}{r.intervalDays ? ` (${r.intervalDays} dias)` : ""} · {r.category}{r.active ? "" : " · encerrada"}</p>
                </div>
                <Money cents={r.type === "INCOME" ? r.amount : -r.amount} sign className={`shrink-0 font-bold ${r.type === "INCOME" ? "text-income" : "text-expense"}`} />
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {r.thisMonth.map((x) => (
                  <li key={x.id} className={`rounded-full px-3 py-1 text-xs font-semibold ${x.settled ? "bg-income-bg text-income" : x.overdue ? "bg-expense-bg text-expense" : "bg-surface-2 text-muted"}`}>
                    {x.settled ? `${r.type === "INCOME" ? "Recebido" : "Pago"} ${br(x.date)}` : x.overdue ? `Atrasado desde ${br(x.date)}` : `Vence ${br(x.date)}`}
                  </li>
                ))}
                {r.thisMonth.length === 0 && r.active && <li className="text-xs text-muted">Nada neste mês</li>}
              </ul>
              <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
                {r.thisMonth.filter((x) => !x.settled && !x.isCard).slice(0, 1).map((x) => (
                  <RowBtn key={x.id} label={r.type === "INCOME" ? "Marcar recebido" : "Marcar pago"} onRun={settle.bind(null, x.id)} />
                ))}
                {r.active && <RowBtn label={r.active ? "Pausar" : "Retomar"} onRun={pauseRecurring.bind(null, r.id, !r.active)} />}
                {!r.active && <RowBtn label="Retomar" onRun={pauseRecurring.bind(null, r.id, true)} />}
                {r.active && <RowBtn label="Encerrar" danger confirm="Encerrar este compromisso? As próximas contas não pagas serão removidas; o histórico fica." onRun={stopRecurring.bind(null, r.id)} />}
              </div>
              {r.active && (
                <details><summary className="cursor-pointer py-1 text-sm font-semibold text-accent">Editar valor e dados</summary>
                  <div className="pt-2"><RecurringEditForm id={r.id} description={r.description} amount={r.amount} categoryId={r.categoryId} endDate={r.endDate} categories={categories.filter((c) => c.type === r.type)} /></div></details>
              )}
            </li>
          ))}
        </ul>
      </Card>
    );
  };
  return (
    <>
      <MonthNav month={month} base="/planejamento?tab=compromissos" />
      <section aria-label="Resumo das contas fixas" className="grid grid-cols-2 gap-2">
        {[["Previsto no mês", <Money key="a" cents={t.expected} />], ["Já pago", <Money key="b" cents={t.paid} className="text-income" />],
          ["Falta pagar", <Money key="c" cents={t.remaining} />], ["Atrasado", <Money key="d" cents={t.overdue} className={t.overdue > 0 ? "text-expense" : ""} />],
          ["Custo fixo mensal médio", <Money key="e" cents={t.monthlyEquivalent} />], ["Peso na renda do mês", t.incomeShare === null ? "Não disponível" : `${t.incomeShare}%`]].map(([l, v]) => (
          <div key={l as string} className="rounded-md border border-border bg-surface p-3"><p className="text-xs font-medium text-muted">{l}</p><p className="mt-1 font-bold">{v}</p></div>
        ))}
      </section>
      {o.items.length === 0 && <Card><Empty title="Nenhuma conta fixa" hint="Cadastre aluguel, internet, assinaturas, salário… ou marque “Repetir” ao registrar um gasto." /></Card>}
      {section("EXPENSE", "Despesas fixas")}
      {section("INCOME", "Receitas fixas")}
      <section aria-label="A pagar e a receber">
        <h2 className="mb-2 px-1 font-bold">Tudo que está previsto</h2>
        {planned.items.length === 0 ? <Card><Empty title="Nada previsto" hint="Compromissos e lançamentos previstos aparecem aqui até serem confirmados." /></Card> : <TxList items={planned.items} categories={categories as { id: string; name: string; type: "INCOME" | "EXPENSE" }[]} grouped={false} />}
      </section>
      <details className={det}><summary className={sum}>Novo compromisso</summary><div className="p-4 pt-0"><RecurringForm categories={categories} accounts={accounts} cards={cards.map((c) => ({ id: c.id, name: c.name }))} today={iso} /></div></details>
    </>
  );
}

async function Investments({ accounts, iso }: { accounts: { id: string; name: string }[]; iso: string }) {
  const o = await investmentsOverview();
  return (
    <>
      <section className="rounded-lg border border-border bg-surface p-5">
        <p className="text-sm font-medium text-muted">Total investido hoje</p>
        <p className="mt-1 text-4xl font-bold"><Money cents={o.total} /></p>
        <p className="mt-2 text-sm"><span className="text-muted">Rendimento total: </span>
          <Money cents={o.totalReturn} sign className={`font-bold ${o.totalReturn >= 0 ? "text-income" : "text-expense"}`} />
          {o.returnPercent !== null && <span className="font-semibold"> ({o.returnPercent > 0 ? "+" : ""}{o.returnPercent}%)</span>}</p>
      </section>
      {o.allocation.length > 1 && (
        <Card title="Distribuição">
          <ul className="flex flex-col gap-3">{o.allocation.map((a) => (
            <li key={a.type}><div className="mb-1 flex justify-between text-sm"><span>{INV_LABEL[a.type]}</span><span className="font-semibold">{a.percent}%</span></div>
              <Progress value={a.percent ?? 0} label={`${INV_LABEL[a.type]}: ${a.percent}%`} /></li>))}</ul>
        </Card>
      )}
      {o.items.length === 0 ? <Card><Empty title="Nenhum investimento cadastrado" hint="Cadastre o que você já tem (CDB, Tesouro, ações…) e registre aportes. O valor é atualizado manualmente, sem integração com corretora." /></Card> : (
        <ul className="flex flex-col gap-3">
          {o.items.map((i) => (
            <li key={i.id} className="rounded-md border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-bold">{i.name}</p><p className="text-xs text-muted">{INV_LABEL[i.type]}{i.institution ? ` · ${i.institution}` : ""} · valor de {i.valueUpdatedAt.split("-").reverse().join("/")}</p></div>
                <RowBtn label="Arquivar" danger confirm="Arquivar este investimento? Ele sai do patrimônio; o histórico de aportes nas contas permanece." onRun={removeInvestment.bind(null, i.id)} />
              </div>
              <p className="mt-1 text-2xl font-bold"><Money cents={i.value} /></p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
                <div><dt>Aportado</dt><dd className="font-semibold text-text"><Money cents={i.contributed} /></dd></div>
                <div><dt>Resgatado</dt><dd className="font-semibold text-text"><Money cents={i.withdrawn} /></dd></div>
                <div><dt>Rendimento</dt><dd className={`font-semibold ${i.totalReturn >= 0 ? "text-income" : "text-expense"}`}><Money cents={i.totalReturn} sign />{i.returnPercent !== null && ` (${i.returnPercent}%)`}</dd></div>
              </dl>
              <details className="mt-2"><summary className="cursor-pointer py-1 font-semibold text-accent">Aporte ou resgate</summary><div className="pt-2"><InvestMoveForm investmentId={i.id} accounts={accounts} today={iso} value={i.value} /></div></details>
              <details><summary className="cursor-pointer py-1 font-semibold text-accent">Atualizar valor de hoje</summary><div className="pt-2"><InvestValueForm investmentId={i.id} current={i.value} today={iso} /></div></details>
              {i.history.length > 0 && (
                <details><summary className="cursor-pointer py-1 text-sm text-muted">Últimos registros</summary>
                  <ul className="divide-y divide-border text-sm">{i.history.slice().reverse().map((h, k) => (
                    <li key={k} className="flex justify-between py-1.5"><span>{{ CONTRIBUTION: "Aporte", WITHDRAWAL: "Resgate", VALUE_UPDATE: "Valor atualizado" }[h.kind]} · {h.date.split("-").reverse().join("/")}</span><Money cents={h.amount} className="font-semibold" /></li>))}</ul></details>
              )}
            </li>
          ))}
        </ul>
      )}
      <details className={det}><summary className={sum}>Novo investimento</summary><div className="p-4 pt-0"><InvestmentForm today={iso} /></div></details>
    </>
  );
}

async function Reports({ month }: { month: string }) {
  const today = todayBR();
  const [s, series, fv, proj, debts, cats] = await Promise.all([
    monthSummary(month), yearlySeries(monthKey(today), 12), fixedVsVariable(month), balanceProjection(today, 6), debtsOverview(),
    prisma.category.findMany(),
  ]);
  const total = s.byCategory.reduce((a, c) => a + c.total, 0);
  const label = (k: string) => new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(k + "-01T12:00:00Z")).replace(".", "");
  return (
    <>
      <MonthNav month={month} base="/planejamento?tab=relatorios" />
      <section className="grid grid-cols-2 gap-2" aria-label="Indicadores">
        {[["Receita mensal", <Money key="a" cents={s.income} className="text-income" />], ["Despesa mensal", <Money key="b" cents={s.expense} className="text-expense" />],
          ["Resultado", <Money key="c" cents={s.result} />], ["Taxa de poupança", s.savingsRate === null ? "Não disponível" : `${s.savingsRate}%`],
          ["Despesas fixas", <Money key="d" cents={fv.fixed} />], ["Despesas variáveis", <Money key="e" cents={fv.variable} />],
          ["Comprometimento da renda", fv.commitmentPercent === null ? "Não disponível" : `${fv.commitmentPercent}%`], ["Dívidas restantes", <Money key="f" cents={debts.reduce((a, x) => a + x.balance, 0)} />]].map(([l, v]) => (
          <div key={l as string} className="rounded-md border border-border bg-surface p-3"><p className="text-xs font-medium text-muted">{l}</p><p className="mt-1 font-bold">{v}</p></div>
        ))}
      </section>
      <Card title="Últimos 12 meses"><SeriesChart data={series.map((x) => ({ label: label(x.month), income: x.income, expense: x.expense, balance: x.balance }))} />
        <p className="mt-2 text-xs text-muted">Barras: receitas e despesas. Linha: saldo das contas ao fim de cada mês (evolução patrimonial financeira).</p></Card>
      <Card title="Gastos por categoria">
        {s.byCategory.length === 0 ? <Empty title="Sem despesas neste mês" /> : (
          <ul className="flex flex-col gap-3">{s.byCategory.map((c) => (
            <li key={c.categoryId}><div className="mb-1 flex justify-between text-sm"><span>{cats.find((x) => x.id === c.categoryId)?.name}</span><span className="font-semibold"><Money cents={c.total} /> · {total ? Math.round((c.total / total) * 100) : 0}%</span></div>
              <Progress value={total ? (c.total / total) * 100 : 0} label={`${cats.find((x) => x.id === c.categoryId)?.name}`} tone="expense" /></li>))}</ul>
        )}
      </Card>
      <Card title="Projeção do saldo">
        <ul className="divide-y divide-border text-sm">{proj.map((p) => (
          <li key={p.month} className="flex justify-between py-2"><span className="capitalize">{label(p.month)}/{p.month.slice(2, 4)}</span><span><Money cents={p.planned} sign className="mr-3 text-muted" /><Money cents={p.balance} className="font-bold" /></span></li>))}</ul>
        <p className="mt-2 text-xs text-muted">Saldo atual + previstos − faturas em aberto, mês a mês.</p>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <a href="/api/export/transactions.csv" className="rounded-md bg-surface-2 py-3.5 text-center font-semibold">Exportar CSV</a>
        <Link href={`/relatorio/${month}`} className="rounded-md bg-surface-2 py-3.5 text-center font-semibold">Resumo para imprimir</Link>
      </div>
    </>
  );
}
