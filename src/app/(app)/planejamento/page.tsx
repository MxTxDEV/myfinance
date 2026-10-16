import Link from "next/link";
import { currentProfile, prisma } from "@/server/db";
import { cardOverview, cardTimeline } from "@/server/services/cards";
import { financialPlan } from "@/server/services/plan";
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
import { archiveCard, pauseRecurring, removeAsset, removeDebt, removeBudget, removeGoal, removeInvestment, settle, stopRecurring } from "../actions";
import { CardForm, PayInvoiceForm } from "../perfil/forms";
import { AssetForm, BudgetForm, CardEditForm, DebtEditForm, InvoiceBasesForm, DebtForm, DebtPayForm, FixedExpenseForm, PlanPrefsForm, GoalEntryForm, GoalForm, INV_LABEL, InvestmentForm, InvestMoveForm, InvestValueForm, RecurringEditForm, RecurringForm, RowBtn } from "./forms";

const TABS = [["orcamentos", "Orçamentos"], ["metas", "Metas"], ["dividas", "Dívidas"], ["cartoes", "Cartões"], ["investimentos", "Investimentos"], ["patrimonio", "Patrimônio"], ["compromissos", "Contas fixas"], ["relatorios", "Relatórios"]] as const;
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
      {tab === "cartoes" && <Cards accounts={accounts} iso={iso} />}
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
  const [g, profile] = await Promise.all([goalsOverview(), currentProfile()]);
  const fp = await financialPlan(profile?.planPrefs);
  const sg = fp.suggestion;
  // Para metas: a reserva do mês + o extra, se não houver dívida (com dívida, o extra vai para quitá-la primeiro).
  const saveMonthly = sg.status === "OK" ? sg.reserve + (fp.totalDebt > 0 ? 0 : sg.extraForDebts) : 0;
  return (
    <>
      {fp.income > 0 && (
        <section className="rounded-lg border border-border bg-surface p-5" aria-label="Quanto posso guardar">
          <p className="text-sm font-medium text-muted">Quanto posso guardar por mês</p>
          {saveMonthly > 0 ? (
            <>
              <p className="mt-1 text-3xl font-bold"><Money cents={saveMonthly} /></p>
              <p className="text-sm text-muted">{fp.totalDebt > 0 ? "É a reserva do plano; o extra do mês está indo para quitar as dívidas primeiro (aba Dívidas)." : "Reserva + o que sobra depois das contas fixas e do gasto livre."}</p>
            </>
          ) : <p className="mt-1 text-sm">Hoje não sobra para guardar depois das contas fixas e parcelas. Veja o plano na aba Dívidas.</p>}
        </section>
      )}
      {g.items.length === 0 ? <Card><Empty title="Nenhuma meta ainda" hint="Crie uma meta, como uma reserva de emergência, e acompanhe o progresso." /></Card> : (
        <ul className="flex flex-col gap-3">
          {g.items.map((x) => (
            <li key={x.id} className="rounded-md border border-border bg-surface p-4">
              <div className="flex items-center justify-between"><p className="font-bold">{x.name}</p><RowBtn label="Arquivar" danger confirm="Arquivar esta meta?" onRun={removeGoal.bind(null, x.id)} /></div>
              <div className="my-2"><Progress value={x.percent} label={`${x.name}: ${x.percent}%`} tone={x.percent >= 100 ? "income" : "accent"} /></div>
              <div className="flex justify-between text-sm"><span><Money cents={x.saved} className="font-semibold" /> de <Money cents={x.target} /></span><span className="font-semibold">{x.percent}%</span></div>
              {x.monthlyNeeded !== null && x.remaining > 0 && <p className="mt-1 text-sm text-muted">Precisa guardar <Money cents={x.monthlyNeeded} className="font-semibold text-text" />/mês até {x.targetDate!.split("-").reverse().join("/")}.</p>}
              {saveMonthly > 0 && x.remaining > 0 && <p className="mt-1 text-sm text-muted">Guardando <Money cents={saveMonthly} className="font-semibold text-text" />/mês, você chega lá em cerca de {Math.ceil(x.remaining / saveMonthly)} {Math.ceil(x.remaining / saveMonthly) === 1 ? "mês" : "meses"}.</p>}
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

const KIND_LABEL: Record<string, string> = { CARTAO: "Cartão", VEICULO: "Carro/moto", FINANCIAMENTO: "Financiamento", EMPRESTIMO: "Empréstimo", OUTRO: "Dívida" };
const monthYear = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;
const span = (m: number | null) => (m === null ? "não quita nesse ritmo" : m < 12 ? `${m} ${m === 1 ? "mês" : "meses"}` : `${Math.floor(m / 12)} ${Math.floor(m / 12) === 1 ? "ano" : "anos"}${m % 12 ? ` e ${m % 12} ${m % 12 === 1 ? "mês" : "meses"}` : ""}`);

async function Debts({ accounts, iso }: { accounts: { id: string; name: string }[]; iso: string }) {
  const profile = await currentProfile();
  const [debts, p, fixed, cards] = await Promise.all([
    debtsOverview(), financialPlan(profile?.planPrefs), fixedOverview(), prisma.creditCard.findMany({ where: { archivedAt: null } }),
  ]);
  const sg = p.suggestion;
  const fixedExpenses = fixed.items.filter((i) => i.type === "EXPENSE" && i.active);
  return (
    <>
      <section className="rounded-lg border border-border bg-surface p-5" aria-label="Quanto posso gastar por mês">
        <p className="text-sm font-medium text-muted">Quanto posso gastar por mês</p>
        {p.income <= 0 ? (
          <p className="mt-2 text-sm">Informe a sua renda mensal abaixo para eu calcular o seu orçamento ideal.</p>
        ) : sg.status === "DEFICIT" ? (
          <>
            <p className="mt-1 text-2xl font-bold text-expense">Faltam <Money cents={sg.shortfall} /> por mês</p>
            <p className="mt-1 text-sm">Só as contas fixas (<Money cents={sg.fixed} />) e as parcelas das dívidas (<Money cents={sg.debtMin} />) já passam da renda (<Money cents={sg.income} />). Antes de gastar qualquer coisa, é preciso cortar fixos, renegociar parcelas ou aumentar a renda.</p>
          </>
        ) : (
          <>
            <p className="mt-1 text-4xl font-bold"><Money cents={sg.variableCap} /></p>
            <p className="text-sm text-muted">por mês fora as contas fixas e as dívidas — cerca de <Money cents={sg.perDay} className="font-semibold text-text" /> por dia.{p.avgVariable > 0 && <> Nos últimos 3 meses você gastou em média <Money cents={p.avgVariable} className="font-semibold text-text" />.</>}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Renda{p.incomeIsManual ? "" : " (média)"}</dt><dd className="text-right font-semibold text-income"><Money cents={sg.income} /></dd>
              <dt className="text-muted">Despesas fixas</dt><dd className="text-right font-semibold"><Money cents={sg.fixed} /></dd>
              <dt className="text-muted">Parcelas das dívidas</dt><dd className="text-right font-semibold"><Money cents={sg.debtMin} /></dd>
              <dt className="text-muted">Reserva ({p.totalDebt > 0 ? "5" : "10"}%)</dt><dd className="text-right font-semibold"><Money cents={sg.reserve} /></dd>
              <dt className="text-muted">Gasto livre</dt><dd className="text-right font-semibold"><Money cents={sg.variableCap} /></dd>
              <dt className="text-muted">{p.totalDebt > 0 ? "Extra para quitar dívidas" : "Sobra para guardar"}</dt><dd className="text-right font-semibold text-income"><Money cents={sg.extraForDebts} /></dd>
            </dl>
            {sg.status === "TIGHT" && <p className="mt-2 text-sm text-expense">Aperto: depois de fixos e parcelas quase nada sobra para reserva ou extra. Cada real gasto fora do plano vira dívida.</p>}
          </>
        )}
      </section>

      {p.debts.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-5" aria-label="Plano de quitação">
          <p className="text-sm font-medium text-muted">Plano para quitar tudo</p>
          {p.result.months === null ? (
            <p className="mt-1 text-lg font-bold text-expense">Nesse ritmo as dívidas não zeram</p>
          ) : (
            <p className="mt-1 text-3xl font-bold">Livre em {monthYear(p.result.date!)}</p>
          )}
          <p className="text-sm text-muted">{p.result.months !== null ? `Daqui a ${span(p.result.months)}, ` : ""}pagando <Money cents={p.debtMin + sg.extraForDebts} className="font-semibold text-text" /> por mês no total (<Money cents={p.debtMin} /> de parcelas + <Money cents={sg.extraForDebts} /> de extra). Juros no caminho: <Money cents={p.result.totalInterest} className="font-semibold text-expense" />.</p>
          {p.saved && p.saved.months > 0 && <p className="mt-1 text-sm text-income">Comparado a pagar só as parcelas: {p.saved.months} {p.saved.months === 1 ? "mês" : "meses"} a menos e <Money cents={p.saved.interest} /> de juros economizados.</p>}
          {p.baseline.months === null && <p className="mt-1 text-sm text-muted">Pagando só as parcelas, ao menos uma dívida nunca zera (a parcela não cobre os juros).</p>}
          {p.result.order.length > 0 && (
            <ol className="mt-3 flex flex-col gap-1 text-sm">
              {p.result.order.map((o, i) => <li key={o.id}><span className="font-semibold">{i + 1}º {o.name}</span> — quitada em {monthYear(o.date)} <span className="text-muted">({span(o.month)})</span></li>)}
            </ol>
          )}
          <p className="mt-3 text-xs text-muted">Ordem usada: {p.prefs.strategy === "AVALANCHE" ? "juros mais altos primeiro" : "menor saldo primeiro"}. A outra ordem levaria {span(p.prefs.strategy === "AVALANCHE" ? p.compare.SNOWBALL.months : p.compare.AVALANCHE.months)} e <Money cents={p.prefs.strategy === "AVALANCHE" ? p.compare.SNOWBALL.interest : p.compare.AVALANCHE.interest} /> de juros. Quando uma dívida zera, a parcela dela vai para a próxima.</p>
        </section>
      )}

      <details className={det}><summary className={sum}>Ajustar renda, gasto e ordem</summary><div className="p-4 pt-0"><PlanPrefsForm income={p.prefs.income} detected={p.detectedIncome} variable={p.prefs.variable} strategy={p.prefs.strategy} /></div></details>

      {p.debts.some((x) => x.auto) && (
        <Card title="Cartões de crédito (automático)">
          <ul className="divide-y divide-border text-sm">
            {p.debts.filter((x) => x.auto).map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0 truncate">{x.name}{x.payoffDate ? <span className="text-muted"> · quitado em {monthYear(x.payoffDate)}</span> : ""}</span><Money cents={x.balance} className="shrink-0 font-semibold" /></li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Sobe sozinho a cada compra no cartão. Detalhes, faturas e parcelas na aba <Link href="/planejamento?tab=cartoes" className="font-semibold text-accent">Cartões</Link>.</p>
        </Card>
      )}
      <h2 className="px-1 font-bold">Minhas dívidas</h2>
      {debts.length === 0 ? <Card><Empty title="Nenhuma dívida cadastrada" hint="Cadastre o carro, financiamentos e empréstimos para eu montar o plano de quitação. Os cartões ficam na aba Cartões e entram sozinhos." /></Card> : (
        <ul className="flex flex-col gap-3">
          {debts.map((x) => {
            const pl = p.debts.find((d) => d.id === x.id && !d.auto);
            return (
              <li key={x.id} className="rounded-md border border-border bg-surface p-4">
                <p className="font-bold">{x.name} <span className="text-sm font-normal text-muted">{KIND_LABEL[x.kind] ?? "Dívida"}{x.creditor ? ` · ${x.creditor}` : ""}</span></p>
                <p className="mt-1 text-2xl font-bold"><Money cents={x.balance} /></p>
                <div className="my-2"><Progress value={x.original ? (x.paid / x.original) * 100 : 0} label={`${x.name}: ${x.original ? Math.max(0, Math.round((x.paid / x.original) * 100)) : 0}% quitado`} tone="income" /></div>
                <p className="text-sm text-muted">Original <Money cents={x.original} /> · pago <Money cents={Math.max(0, x.paid)} />{x.installmentAmount ? <> · parcela <Money cents={x.installmentAmount} /></> : ""}{x.monthlyRate ? ` · ${String(x.monthlyRate).replace(".", ",")}% ao mês` : ""}{x.nextDueDate && ` · vence ${x.nextDueDate.split("-").reverse().join("/")}`}</p>
                {pl?.payoffDate && <p className="mt-1 text-sm">No plano, quitada em {monthYear(pl.payoffDate)}.</p>}
                {!x.installmentAmount && <p className="mt-1 text-sm text-muted">Sem parcela informada: ela só recebe o que sobra do extra. Informe a parcela (ou o mínimo do cartão) para o plano ficar fiel.</p>}
                <div className="mt-1 flex flex-wrap gap-x-4">
                  <details><summary className="cursor-pointer py-1 font-semibold text-accent">Atualizar saldo, juros e parcela</summary><div className="pt-2"><DebtEditForm id={x.id} balance={x.balance} rate={x.monthlyRate} installment={x.installmentAmount} kind={x.kind} /></div></details>
                  {x.balance > 0 && accounts.length > 0 && <details><summary className="cursor-pointer py-1 font-semibold text-accent">Registrar pagamento</summary><div className="pt-2"><DebtPayForm debtId={x.id} balance={x.balance} accounts={accounts} today={iso} /></div></details>}
                  <RowBtn label="Remover" danger confirm="Remover esta dívida do plano? O histórico de pagamentos é mantido." onRun={removeDebt.bind(null, x.id)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <details className={det}><summary className={sum}>Nova dívida (cartão, carro, empréstimo…)</summary><div className="p-4 pt-0"><DebtForm /></div></details>

      <Card title={`Despesas fixas (${fixedExpenses.length})`}>
        {fixedExpenses.length === 0 ? <p className="text-sm text-muted">Nenhuma ainda. Cadastre aluguel, internet, escola, plano de saúde… elas entram no cálculo do quanto você pode gastar e nos avisos de vencimento.</p> : (
          <ul className="divide-y divide-border">
            {fixedExpenses.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 truncate">{f.description} <span className="text-muted">· {f.category}</span></span>
                <Money cents={f.monthlyEquivalent} className="shrink-0 font-semibold" />
              </li>
            ))}
            <li className="flex items-center justify-between pt-2 text-sm font-bold"><span>Total por mês</span><Money cents={p.fixedMonthly} /></li>
          </ul>
        )}
        <details className="mt-3"><summary className="cursor-pointer py-1 font-semibold text-accent">Adicionar despesa fixa</summary><div className="pt-2"><FixedExpenseForm accounts={accounts} cards={cards.map((c) => ({ id: c.id, name: c.name }))} /></div></details>
        <p className="mt-2 text-xs text-muted">Para editar ou encerrar uma despesa, use a aba “Contas fixas”.</p>
      </Card>
    </>
  );
}

const INV_STATUS: Record<string, string> = { OPEN: "Aberta", CLOSED: "Fechada", PAID: "Paga", PARTIAL: "Parcial", OVERDUE: "Atrasada" };
const brDate = (d: string) => d.split("-").reverse().join("/");

async function Cards({ accounts, iso }: { accounts: { id: string; name: string }[]; iso: string }) {
  const [cards, rows] = await Promise.all([cardOverview(), prisma.creditCard.findMany({ where: { archivedAt: null } })]);
  const timelines = await Promise.all(cards.map((c) => cardTimeline(c.id, undefined, 6)));
  const totalUsed = cards.reduce((s, c) => s + c.used, 0), totalLimit = cards.reduce((s, c) => s + c.limit, 0);
  const dueSoon = timelines.flatMap((t) => t.filter((i) => i.remaining > 0 && i.status !== "OPEN").map((i) => i.remaining)).reduce((a, b) => a + b, 0);
  return (
    <>
      {cards.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-5" aria-label="Resumo dos cartões">
          <p className="text-sm font-medium text-muted">Total usado nos cartões</p>
          <p className="mt-1 text-4xl font-bold"><Money cents={totalUsed} /></p>
          <p className="text-sm text-muted">de <Money cents={totalLimit} /> de limite ({totalLimit ? Math.round((totalUsed / totalLimit) * 100) : 0}%) em {cards.length} {cards.length === 1 ? "cartão" : "cartões"}.{dueSoon > 0 && <> Faturas fechadas a pagar: <Money cents={dueSoon} className="font-semibold text-expense" />.</>}</p>
          <p className="mt-2 text-xs text-muted">Cada compra ou parcela que você lança em um cartão entra sozinha na fatura certa e sobe esse total. O “usado” inclui as parcelas dos meses seguintes.</p>
        </section>
      )}
      {cards.length === 0 && <Card><Empty title="Nenhum cartão" hint={accounts.length ? "Cadastre seus cartões abaixo, um por um." : "Crie uma conta em Perfil antes de cadastrar um cartão."} /></Card>}
      {cards.map((c, idx) => {
        const tl = timelines[idx];
        const cur = tl[0], next = tl[1];
        const pct = c.limit ? Math.round((c.used / c.limit) * 100) : 0;
        const rate = rows.find((r) => r.id === c.id)?.monthlyRate;
        return (
          <section key={c.id} className="rounded-lg border border-border bg-surface p-5" aria-label={`Cartão ${c.name}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="truncate text-lg font-bold">{c.name}</p><p className="text-xs text-muted">Fecha dia {c.closingDay} · vence dia {c.dueDay}{rate ? ` · ${String(rate).replace(".", ",")}% ao mês` : ""}</p></div>
              <RowBtn label="Arquivar" danger confirm="Arquivar este cartão? O histórico é mantido." onRun={archiveCard.bind(null, c.id)} />
            </div>
            <div className="my-3"><Progress value={Math.min(100, pct)} label={`${c.name}: ${pct}% do limite usado`} tone={pct >= 90 ? "expense" : pct >= 70 ? "warning" : "accent"} /></div>
            <p className="text-sm">Usado <Money cents={c.used} className="font-bold" /> de <Money cents={c.limit} /> <span className="text-muted">({pct}%)</span> · disponível <Money cents={c.available} className="font-semibold text-income" /></p>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-md bg-surface-2 p-3"><dt className="text-xs text-muted">Fatura atual{cur ? ` · vence ${brDate(cur.dueDate).slice(0, 5)}` : ""}</dt><dd className="text-xl font-bold"><Money cents={cur?.remaining ?? 0} /></dd>{cur && <dd className="text-xs text-muted">{INV_STATUS[cur.status]} · fecha {brDate(cur.closingDate).slice(0, 5)}</dd>}</div>
              <div className="rounded-md bg-surface-2 p-3"><dt className="text-xs text-muted">Próxima fatura{next ? ` · vence ${brDate(next.dueDate).slice(0, 5)}` : ""}</dt><dd className="text-xl font-bold"><Money cents={next?.remaining ?? 0} /></dd>{next && <dd className="text-xs text-muted">fecha {brDate(next.closingDate).slice(0, 5)}</dd>}</div>
            </dl>
            <h3 className="mb-1 mt-4 text-sm font-bold uppercase tracking-wide text-muted">Mês a mês</h3>
            <ul className="divide-y divide-border text-sm">
              {tl.map((i, k) => (
                <li key={i.referenceMonth} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>{k === 0 ? "Atual" : k === 1 ? "Próxima" : "Mês"} · vence {brDate(i.dueDate).slice(0, 5)}/{i.dueDate.slice(0, 4)} <span className="text-xs text-muted">· {INV_STATUS[i.status]}</span></span>
                    <Money cents={i.total} className="font-semibold" />
                  </div>
                  {(i.base > 0 || i.purchases > 0 || i.paid > 0) && <p className="text-xs text-muted">{i.base > 0 && <>informado <Money cents={i.base} /> · </>}lançado no app <Money cents={i.purchases} />{i.paid > 0 && <> · pago <Money cents={i.paid} /></>}</p>}
                  {i.invoiceId && i.remaining > 0 && <details className="mt-1"><summary className="cursor-pointer font-semibold text-accent">Pagar</summary><div className="pt-2"><PayInvoiceForm invoiceId={i.invoiceId} remaining={i.remaining} today={iso} /></div></details>}
                </li>
              ))}
            </ul>
            <details className="mt-3"><summary className="cursor-pointer py-1 font-semibold text-accent">Informar o que cada fatura já tem (compras e parcelas)</summary>
              <div className="pt-2"><InvoiceBasesForm key={tl.map((i) => `${i.referenceMonth}:${i.base}`).join("|")} cardId={c.id} rows={tl.map((i, k) => ({ referenceMonth: i.referenceMonth, base: i.base, label: `${k === 0 ? "Fatura atual" : k === 1 ? "Próxima fatura" : "Fatura"} · vence ${brDate(i.dueDate)}` }))} /></div>
            </details>
            <details className="mt-1"><summary className="cursor-pointer py-1 font-semibold text-accent">Ajustar limite e juros</summary><div className="pt-2"><CardEditForm id={c.id} limit={c.limit} rate={rate ? Number(rate.toString()) : null} /></div></details>
          </section>
        );
      })}
      {accounts.length > 0 && <details className={det}><summary className={sum}>Novo cartão</summary><div className="p-4 pt-0"><CardForm accounts={accounts} /></div></details>}
      <p className="px-1 text-xs text-muted">Para lançar uma compra ou parcelamento, use o botão “Adicionar” e escolha o cartão. O valor entra na fatura do mês certo, aumenta o limite usado e a dívida do cartão no plano de quitação.</p>
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
