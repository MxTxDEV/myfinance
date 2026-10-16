"use client";
import { useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { Msg, Submit, field, useAction } from "@/components/form-kit";
import * as A from "@/app/(app)/actions";

type Opt = { id: string; name: string };

export function BudgetForm({ categories }: { categories: Opt[] }) {
  const { error, done, pending, run } = useAction();
  const [cat, setCat] = useState(categories[0]?.id ?? ""); const [limit, setLimit] = useState(0); const [alerts, setAlerts] = useState("50,80,100");
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault();
      run(() => A.saveBudget({ categoryId: cat, limit, alertAt: alerts.split(",").map((x) => Number(x.trim())).filter((n) => n > 0) }), () => setLimit(0)); }}>
      <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria" className={field}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <MoneyInput cents={limit} onChange={setLimit} label="Limite mensal" className="!text-2xl" />
      <label className="text-sm text-muted">Avisar ao atingir (%)<input value={alerts} onChange={(e) => setAlerts(e.target.value)} className={`${field} mt-1`} inputMode="numeric" /></label>
      <Msg error={error} done={done} /><Submit pending={pending}>Salvar orçamento</Submit>
    </form>
  );
}

export function GoalForm({ accounts }: { accounts: Opt[] }) {
  const { error, done, pending, run } = useAction();
  const [name, setName] = useState(""); const [target, setTarget] = useState(0); const [date, setDate] = useState(""); const [prio, setPrio] = useState(2); const [acc, setAcc] = useState("");
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault();
      run(() => A.saveGoal({ name, targetAmount: target, targetDate: date || undefined, priority: prio, accountId: acc || undefined }), () => { setName(""); setTarget(0); }); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da meta (ex.: Reserva de emergência)" aria-label="Nome da meta" required className={field} />
      <MoneyInput cents={target} onChange={setTarget} label="Valor-alvo" className="!text-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-muted">Data desejada<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`} /></label>
        <label className="text-sm text-muted">Prioridade<select value={prio} onChange={(e) => setPrio(Number(e.target.value))} className={`${field} mt-1`}><option value={1}>Alta</option><option value={2}>Média</option><option value={3}>Baixa</option></select></label>
      </div>
      <select value={acc} onChange={(e) => setAcc(e.target.value)} aria-label="Conta associada" className={field}><option value="">Sem conta associada</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      <Msg error={error} done={done} /><Submit pending={pending}>Criar meta</Submit>
    </form>
  );
}

export function GoalEntryForm({ goalId, today }: { goalId: string; today: string }) {
  const { error, pending, run } = useAction();
  const [amount, setAmount] = useState(0); const [withdraw, setWithdraw] = useState(false);
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); run(() => A.saveGoalEntry({ goalId, amount: withdraw ? -amount : amount, date: today }), () => setAmount(0)); }}>
      <MoneyInput cents={amount} onChange={setAmount} label="Valor" className="!text-xl" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withdraw} onChange={(e) => setWithdraw(e.target.checked)} className="size-5" />Retirada</label>
      {error && <p role="alert" className="text-sm font-medium text-expense">{error}</p>}
      <Submit pending={pending}>{withdraw ? "Registrar retirada" : "Registrar aporte"}</Submit>
    </form>
  );
}

export function DebtForm() {
  const { error, done, pending, run } = useAction();
  const [name, setName] = useState(""); const [creditor, setCreditor] = useState(""); const [orig, setOrig] = useState(0); const [bal, setBal] = useState(0);
  const [kind, setKind] = useState("VEICULO"); const [rate, setRate] = useState(""); const [inst, setInst] = useState(0); const [n, setN] = useState(""); const [next, setNext] = useState("");
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault();
      run(() => A.saveDebt({ name, creditor: creditor || undefined, originalAmount: orig, balance: bal || orig, monthlyRate: rate ? Number(rate.replace(",", ".")) : undefined,
        installmentAmount: inst || undefined, installmentsTotal: n ? Number(n) : undefined, nextDueDate: next || undefined, kind: kind as "OUTRO" }), () => { setName(""); setOrig(0); setBal(0); setInst(0); setRate(""); }); }}>
      <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo de dívida" className={field}>
        <option value="VEICULO">Carro / moto</option><option value="FINANCIAMENTO">Financiamento</option><option value="EMPRESTIMO">Empréstimo</option><option value="OUTRO">Outra dívida</option>
      </select>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da dívida" aria-label="Nome da dívida" required className={field} />
      <input value={creditor} onChange={(e) => setCreditor(e.target.value)} placeholder="Credor" aria-label="Credor" className={field} />
      <p className="-mb-1 text-sm text-muted">Valor original</p><MoneyInput cents={orig} onChange={setOrig} label="Valor original" className="!text-xl" />
      <p className="-mb-1 text-sm text-muted">Saldo devedor atual (vazio = valor original)</p><MoneyInput cents={bal} onChange={setBal} label="Saldo devedor" className="!text-xl" />
      <div className="grid grid-cols-2 gap-3">
        <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Juros % ao mês" aria-label="Juros ao mês" inputMode="decimal" className={field} />
        <input value={n} onChange={(e) => setN(e.target.value)} placeholder="Nº de parcelas" aria-label="Número de parcelas" inputMode="numeric" className={field} />
      </div>
      <p className="-mb-1 text-sm text-muted">Parcela mensal (ou pagamento mínimo do cartão)</p><MoneyInput cents={inst} onChange={setInst} label="Valor da parcela" className="!text-xl" />
      <label className="text-sm text-muted">Próximo vencimento<input type="date" value={next} onChange={(e) => setNext(e.target.value)} className={`${field} mt-1`} /></label>
      <Msg error={error} done={done} /><Submit pending={pending}>Cadastrar dívida</Submit>
    </form>
  );
}

export function DebtPayForm({ debtId, balance, accounts, today }: { debtId: string; balance: number; accounts: Opt[]; today: string }) {
  const { error, pending, run } = useAction();
  const [amount, setAmount] = useState(0); const [acc, setAcc] = useState(accounts[0]?.id ?? "");
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); run(() => A.saveDebtPayment({ debtId, amount, date: today, accountId: acc })); }}>
      <MoneyInput cents={amount} onChange={setAmount} label="Valor pago" className="!text-xl" />
      <select value={acc} onChange={(e) => setAcc(e.target.value)} aria-label="Conta" className={field}>{accounts.map((a) => <option key={a.id} value={a.id}>Paga com: {a.name}</option>)}</select>
      {amount > balance && <p className="text-sm text-expense">Maior que o saldo devedor.</p>}
      {error && <p role="alert" className="text-sm font-medium text-expense">{error}</p>}
      <Submit pending={pending}>Registrar pagamento</Submit>
    </form>
  );
}

export function AssetForm({ today }: { today: string }) {
  const { error, done, pending, run } = useAction();
  const [name, setName] = useState(""); const [type, setType] = useState("VEHICLE"); const [value, setValue] = useState(0);
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => A.saveAsset({ name, type: type as "VEHICLE", value, valueUpdatedAt: today }), () => { setName(""); setValue(0); }); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: Carro, CDB)" aria-label="Nome do bem" required className={field} />
      <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo" className={field}>
        <option value="VEHICLE">Veículo</option><option value="PROPERTY">Imóvel</option><option value="EQUIPMENT">Equipamento</option><option value="INVESTMENT">Investimento</option><option value="OTHER">Outro</option>
      </select>
      <MoneyInput cents={value} onChange={setValue} label="Valor estimado" className="!text-xl" />
      <Msg error={error} done={done} /><Submit pending={pending}>Cadastrar bem</Submit>
    </form>
  );
}

export function RecurringForm({ categories, accounts, cards, today }: { categories: (Opt & { type: string })[]; accounts: Opt[]; cards: Opt[]; today: string }) {
  const { error, done, pending, run } = useAction();
  const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE"); const [desc, setDesc] = useState(""); const [amount, setAmount] = useState(0);
  const cats = categories.filter((c) => c.type === type); const [cat, setCat] = useState(""); const [target, setTarget] = useState(accounts[0] ? `acc:${accounts[0].id}` : "");
  const [rec, setRec] = useState("MONTHLY"); const [interval, setInterval_] = useState("30"); const [start, setStart] = useState(today); const [end, setEnd] = useState("");
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); const [k, id] = target.split(":");
      run(() => A.saveRecurring({ description: desc, type, amount, categoryId: cat || cats[0]?.id, recurrence: rec as "MONTHLY", intervalDays: rec === "CUSTOM" ? Number(interval) : undefined,
        startDate: start, endDate: end || undefined, ...(k === "card" ? { cardId: id } : { accountId: id }) }), () => { setDesc(""); setAmount(0); }); }}>
      <div className="grid grid-cols-2 gap-3">
        <select value={type} onChange={(e) => { setType(e.target.value as "INCOME" | "EXPENSE"); setCat(""); }} aria-label="Tipo" className={field}><option value="EXPENSE">Despesa</option><option value="INCOME">Receita</option></select>
        <select value={rec} onChange={(e) => setRec(e.target.value)} aria-label="Recorrência" className={field}>
          <option value="MONTHLY">Mensal</option><option value="WEEKLY">Semanal</option><option value="BIWEEKLY">Quinzenal</option><option value="YEARLY">Anual</option><option value="CUSTOM">Intervalo em dias</option>
        </select>
      </div>
      {rec === "CUSTOM" && <input value={interval} onChange={(e) => setInterval_(e.target.value)} aria-label="Intervalo em dias" inputMode="numeric" className={field} />}
      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição (ex.: Internet)" aria-label="Descrição" required className={field} />
      <MoneyInput cents={amount} onChange={setAmount} label="Valor" className="!text-xl" />
      <select value={cat || cats[0]?.id} onChange={(e) => setCat(e.target.value)} aria-label="Categoria" className={field}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Conta ou cartão" className={field}>
        <optgroup label="Contas">{accounts.map((a) => <option key={a.id} value={`acc:${a.id}`}>{a.name}</option>)}</optgroup>
        {type === "EXPENSE" && cards.length > 0 && <optgroup label="Cartões">{cards.map((c) => <option key={c.id} value={`card:${c.id}`}>{c.name}</option>)}</optgroup>}
      </select>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-muted">Primeira data<input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`${field} mt-1`} /></label>
        <label className="text-sm text-muted">Até (opcional)<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={`${field} mt-1`} /></label>
      </div>
      <Msg error={error} done={done} /><Submit pending={pending}>Cadastrar compromisso</Submit>
    </form>
  );
}

export function RowBtn({ label, confirm, onRun, danger }: { label: string; confirm?: string; onRun: () => Promise<{ ok: boolean; error?: string }>; danger?: boolean }) {
  const { error, pending, run } = useAction();
  return (
    <span className="inline-flex flex-col items-end">
      <button disabled={pending} onClick={() => { if (confirm && !window.confirm(confirm)) return; run(onRun); }} className={`min-h-10 px-2 text-sm font-semibold ${danger ? "text-expense" : "text-accent"}`}>{label}</button>
      {error && <span role="alert" className="max-w-48 text-right text-xs text-expense">{error}</span>}
    </span>
  );
}

const INV_TYPES: [string, string][] = [["FIXED_INCOME", "Renda fixa (CDB, LCI…)"], ["TREASURY", "Tesouro Direto"], ["STOCKS", "Ações"], ["REAL_ESTATE_FUND", "Fundos imobiliários"], ["FUNDS", "Fundos"], ["CRYPTO", "Cripto"], ["PENSION", "Previdência"], ["OTHER", "Outro"]];
export const INV_LABEL = Object.fromEntries(INV_TYPES);

export function InvestmentForm({ today }: { today: string }) {
  const { error, done, pending, run } = useAction();
  const [name, setName] = useState(""); const [type, setType] = useState("FIXED_INCOME"); const [inst, setInst] = useState(""); const [value, setValue] = useState(0);
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault();
      run(() => A.saveInvestment({ name, type: type as "FIXED_INCOME", institution: inst || undefined, initialValue: value, date: today }), () => { setName(""); setValue(0); }); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: CDB Banco X 110% CDI)" aria-label="Nome do investimento" required className={field} />
      <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo de investimento" className={field}>{INV_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <input value={inst} onChange={(e) => setInst(e.target.value)} placeholder="Instituição (opcional)" aria-label="Instituição" className={field} />
      <p className="-mb-1 text-sm text-muted">Quanto você já tem nele hoje (deixe zero se vai começar agora)</p>
      <MoneyInput cents={value} onChange={setValue} label="Valor atual" className="!text-xl" />
      <Msg error={error} done={done} /><Submit pending={pending}>Cadastrar investimento</Submit>
    </form>
  );
}

export function InvestMoveForm({ investmentId, accounts, today, value }: { investmentId: string; accounts: Opt[]; today: string; value: number }) {
  const { error, done, pending, run } = useAction();
  const [amount, setAmount] = useState(0); const [kind, setKind] = useState<"in" | "out">("in"); const [acc, setAcc] = useState(accounts[0]?.id ?? "");
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault();
      const base = { investmentId, amount, date: today, accountId: acc || undefined };
      run(() => (kind === "in" ? A.investContribute(base) : A.investWithdraw(base)), () => setAmount(0)); }}>
      <div role="group" aria-label="Tipo de movimento" className="grid grid-cols-2 gap-1 rounded-md bg-surface-2 p-1">
        {([["in", "Aporte"], ["out", "Resgate"]] as const).map(([k, l]) => (
          <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-sm py-2 text-sm font-bold ${kind === k ? "bg-accent text-on-accent" : "text-muted"}`}>{l}</button>
        ))}
      </div>
      <MoneyInput cents={amount} onChange={setAmount} label="Valor" className="!text-xl" />
      <select value={acc} onChange={(e) => setAcc(e.target.value)} aria-label="Conta" className={field}>
        <option value="">Só registrar (não mexe em nenhuma conta)</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{kind === "in" ? "Sai de" : "Cai em"}: {a.name}</option>)}
      </select>
      {kind === "out" && amount > value && <p className="text-sm text-expense">Maior que o valor atual do investimento.</p>}
      <Msg error={error} done={done} /><Submit pending={pending}>{kind === "in" ? "Registrar aporte" : "Registrar resgate"}</Submit>
    </form>
  );
}

export function InvestValueForm({ investmentId, current, today }: { investmentId: string; current: number; today: string }) {
  const { error, done, pending, run } = useAction();
  const [value, setValue] = useState(current);
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); run(() => A.investValue({ investmentId, value, date: today })); }}>
      <p className="text-sm text-muted">Informe quanto ele vale hoje (veja no app da corretora). É assim que a rentabilidade é calculada.</p>
      <MoneyInput cents={value} onChange={setValue} label="Valor de hoje" className="!text-xl" />
      <Msg error={error} done={done} /><Submit pending={pending}>Atualizar valor</Submit>
    </form>
  );
}

export function RecurringEditForm({ id, description, amount, categories, categoryId, endDate }: { id: string; description: string; amount: number; categories: Opt[]; categoryId: string; endDate: string | null }) {
  const { error, done, pending, run } = useAction();
  const [desc, setDesc] = useState(description); const [val, setVal] = useState(amount); const [cat, setCat] = useState(categoryId); const [end, setEnd] = useState(endDate ?? "");
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); run(() => A.editRecurring(id, { description: desc, amount: val, categoryId: cat, endDate: end || null })); }}>
      <input value={desc} onChange={(e) => setDesc(e.target.value)} aria-label="Descrição" className={field} maxLength={120} />
      <MoneyInput cents={val} onChange={setVal} label="Valor" className="!text-xl" />
      <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria" className={field}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <label className="text-sm text-muted">Termina em (opcional)<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={`${field} mt-1`} /></label>
      <p className="text-xs text-muted">A mudança vale para as próximas contas ainda não pagas. O que já foi pago não muda.</p>
      <Msg error={error} done={done} /><Submit pending={pending}>Salvar alterações</Submit>
    </form>
  );
}

const KINDS: [string, string][] = [["CARTAO", "Cartão de crédito"], ["VEICULO", "Carro / moto"], ["FINANCIAMENTO", "Financiamento"], ["EMPRESTIMO", "Empréstimo"], ["OUTRO", "Outra dívida"]];


/** Atualiza o que muda com o tempo: saldo, juros e parcela. */
export function DebtEditForm({ id, balance, rate, installment, kind }: { id: string; balance: number; rate: number | null; installment: number | null; kind: string }) {
  const { error, done, pending, run } = useAction();
  const [bal, setBal] = useState(balance); const [r, setR] = useState(rate ? String(rate).replace(".", ",") : ""); const [inst, setInst] = useState(installment ?? 0); const [k, setK] = useState(kind);
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => A.editDebt(id, { balance: bal, monthlyRate: r ? Number(r.replace(",", ".")) : null, installmentAmount: inst || null, kind: k as "OUTRO" })); }}>
      <select value={k} onChange={(e) => setK(e.target.value)} aria-label="Tipo de dívida" className={field}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <p className="-mb-1 text-sm text-muted">Saldo devedor hoje</p><MoneyInput cents={bal} onChange={setBal} label="Saldo devedor" className="!text-xl" />
      <input value={r} onChange={(e) => setR(e.target.value)} placeholder="Juros % ao mês" aria-label="Juros ao mês" inputMode="decimal" className={field} />
      <p className="-mb-1 text-sm text-muted">Parcela mensal (ou mínimo)</p><MoneyInput cents={inst} onChange={setInst} label="Parcela mensal" className="!text-xl" />
      <Msg error={error} done={done} /><Submit pending={pending}>Salvar</Submit>
    </form>
  );
}

/** Despesa fixa em 4 campos: nome, valor, dia do vencimento e de onde sai. */
export function FixedExpenseForm({ accounts, cards }: { accounts: Opt[]; cards: Opt[] }) {
  const { error, done, pending, run } = useAction();
  const [desc, setDesc] = useState(""); const [amount, setAmount] = useState(0); const [day, setDay] = useState("5");
  const [target, setTarget] = useState(accounts[0] ? `acc:${accounts[0].id}` : cards[0] ? `card:${cards[0].id}` : "");
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); const [k, id] = target.split(":");
      run(() => A.saveFixedExpense({ description: desc, amount, day: Number(day), ...(k === "card" ? { cardId: id } : { accountId: id }) }), () => { setDesc(""); setAmount(0); }); }}>
      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Aluguel, Internet, Escola" aria-label="Nome da despesa fixa" required className={field} />
      <MoneyInput cents={amount} onChange={setAmount} label="Valor mensal" className="!text-xl" />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-muted">Dia do vencimento<input value={day} onChange={(e) => setDay(e.target.value)} inputMode="numeric" aria-label="Dia do vencimento" className={`${field} mt-1`} /></label>
        <label className="text-sm text-muted">Sai de
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Conta ou cartão" className={`${field} mt-1`}>
            <optgroup label="Contas">{accounts.map((a) => <option key={a.id} value={`acc:${a.id}`}>{a.name}</option>)}</optgroup>
            {cards.length > 0 && <optgroup label="Cartões">{cards.map((c) => <option key={c.id} value={`card:${c.id}`}>{c.name}</option>)}</optgroup>}
          </select>
        </label>
      </div>
      <Msg error={error} done={done} /><Submit pending={pending || !target}>Adicionar despesa fixa</Submit>
    </form>
  );
}

/** Renda do mês, quanto você quer gastar por mês e a estratégia de quitação. */
export function PlanPrefsForm({ income, detected, variable, strategy }: { income: number | null; detected: number; variable: number | null; strategy: "AVALANCHE" | "SNOWBALL" }) {
  const { error, done, pending, run } = useAction();
  const [inc, setInc] = useState(income ?? 0); const [vr, setVr] = useState(variable ?? 0); const [st, setSt] = useState(strategy);
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => A.savePlan({ income: inc || null, variable: vr || null, strategy: st })); }}>
      <p className="-mb-1 text-sm text-muted">Sua renda mensal (vazio = usar a média dos últimos 3 meses{detected > 0 ? `: ${(detected / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""})</p>
      <MoneyInput cents={inc} onChange={setInc} label="Renda mensal" className="!text-xl" />
      <p className="-mb-1 text-sm text-muted">Quanto você quer gastar por mês fora as contas fixas (vazio = sugestão automática)</p>
      <MoneyInput cents={vr} onChange={setVr} label="Gasto mensal desejado" className="!text-xl" />
      <label className="text-sm text-muted">Ordem de quitação
        <select value={st} onChange={(e) => setSt(e.target.value as "AVALANCHE")} className={`${field} mt-1`}>
          <option value="AVALANCHE">Juros mais altos primeiro (paga menos juros)</option>
          <option value="SNOWBALL">Menor saldo primeiro (vitórias rápidas)</option>
        </select>
      </label>
      <Msg error={error} done={done} /><Submit pending={pending}>Salvar e recalcular</Submit>
    </form>
  );
}

/** O que cada fatura já tem (compras e parcelas de antes de usar o app). Compras novas entram por cima, sozinhas. */
export function InvoiceBasesForm({ cardId, rows }: { cardId: string; rows: { referenceMonth: string; label: string; base: number }[] }) {
  const { error, done, pending, run } = useAction();
  const [v, setV] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((r) => [r.referenceMonth, r.base])));
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => A.saveInvoiceBases(cardId, rows.map((r) => ({ referenceMonth: r.referenceMonth, amount: v[r.referenceMonth] ?? 0 })))); }}>
      <p className="text-sm text-muted">Digite quanto <b>já está</b> em cada fatura: compras que você já fez e parcelas dos meses seguintes. O que você lançar no app daqui em diante soma sozinho por cima. Deixe R$ 0,00 onde não houver nada.</p>
      {rows.map((r) => (
        <div key={r.referenceMonth}>
          <p className="text-sm font-medium">{r.label}</p>
          <MoneyInput cents={v[r.referenceMonth] ?? 0} onChange={(c) => setV((x) => ({ ...x, [r.referenceMonth]: c }))} label={`Fatura ${r.label}`} className="!text-xl" />
        </div>
      ))}
      <Msg error={error} done={done} /><Submit pending={pending}>Salvar faturas</Submit>
    </form>
  );
}

export function CardEditForm({ id, limit, rate }: { id: string; limit: number; rate: number | null }) {
  const { error, done, pending, run } = useAction();
  const [lim, setLim] = useState(limit); const [r, setR] = useState(rate ? String(rate).replace(".", ",") : "");
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => A.editCard(id, { limit: lim, monthlyRate: r ? Number(r.replace(",", ".")) : 0 })); }}>
      <p className="-mb-1 text-sm text-muted">Limite total</p><MoneyInput cents={lim} onChange={setLim} label="Limite do cartão" className="!text-xl" />
      <input value={r} onChange={(e) => setR(e.target.value)} placeholder="Juros % ao mês (usado no plano de quitação)" aria-label="Juros do cartão ao mês" inputMode="decimal" className={field} />
      <Msg error={error} done={done} /><Submit pending={pending}>Salvar</Submit>
    </form>
  );
}
