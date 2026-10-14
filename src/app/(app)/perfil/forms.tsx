"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoneyInput } from "@/components/money-input";
import * as A from "@/app/(app)/actions";

const field = "w-full rounded-md bg-surface-2 px-4 py-3 text-base outline-none focus-visible:ring-2 ring-accent";
type R = { ok: boolean; error?: string };

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<R>, after?: () => void) => start(async () => {
    setError(null); setDone(false);
    const r = await fn();
    if (!r.ok) return setError(r.error ?? "Erro");
    setDone(true); after?.(); router.refresh();
  });
  return { error, done, pending, run };
}
const Msg = ({ error, done }: { error: string | null; done: boolean }) => (
  <>{error && <p role="alert" className="text-sm font-medium text-expense">{error}</p>}{done && <p role="status" className="text-sm font-medium text-income">Salvo ✓</p>}</>
);
const Submit = ({ pending, children }: { pending: boolean; children: React.ReactNode }) => (
  <button disabled={pending} className="rounded-md bg-accent py-3.5 font-bold text-on-accent disabled:opacity-60">{pending ? "Salvando…" : children}</button>
);

export function AccountForm({ today }: { today: string }) {
  const { error, done, pending, run } = useAction();
  const [name, setName] = useState(""); const [type, setType] = useState("CHECKING"); const [inst, setInst] = useState("");
  const [bal, setBal] = useState(0); const [neg, setNeg] = useState(false); const [date, setDate] = useState(today);
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault();
      run(() => A.saveAccount({ name, type: type as "CHECKING", institution: inst || undefined, initialBalance: neg ? -bal : bal, initialBalanceDate: date, color: "#4338CA", icon: "wallet" }), () => { setName(""); setBal(0); }); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: Nubank)" aria-label="Nome da conta" required className={field} />
      <div className="grid grid-cols-2 gap-3">
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo" className={field}>
          <option value="CHECKING">Conta corrente</option><option value="DIGITAL">Conta digital</option><option value="CASH">Carteira em dinheiro</option>
          <option value="SAVINGS">Poupança</option><option value="INVESTMENT">Investimentos</option><option value="OTHER">Outra</option>
        </select>
        <input value={inst} onChange={(e) => setInst(e.target.value)} placeholder="Instituição" aria-label="Instituição" className={field} />
      </div>
      <p className="-mb-1 text-sm text-muted">Saldo inicial</p>
      <MoneyInput cents={bal} onChange={setBal} label="Saldo inicial" className="!text-2xl" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={neg} onChange={(e) => setNeg(e.target.checked)} className="size-5" />Saldo negativo</label>
      <label className="text-sm text-muted">Data do saldo<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`} /></label>
      <Msg error={error} done={done} /><Submit pending={pending}>Criar conta</Submit>
    </form>
  );
}

export function TransferForm({ accounts, today }: { accounts: { id: string; name: string }[]; today: string }) {
  const { error, done, pending, run } = useAction();
  const [from, setFrom] = useState(accounts[0]?.id ?? ""); const [to, setTo] = useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState(0); const [date, setDate] = useState(today);
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => A.saveTransfer({ fromAccountId: from, toAccountId: to, amount, date }), () => setAmount(0)); }}>
      <MoneyInput cents={amount} onChange={setAmount} label="Valor da transferência" className="!text-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Conta de origem" className={field}>{accounts.map((a) => <option key={a.id} value={a.id}>De: {a.name}</option>)}</select>
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Conta de destino" className={field}>{accounts.map((a) => <option key={a.id} value={a.id}>Para: {a.name}</option>)}</select>
      </div>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data" className={field} />
      <Msg error={error} done={done} /><Submit pending={pending}>Transferir</Submit>
    </form>
  );
}

export function CardForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const { error, done, pending, run } = useAction();
  const [name, setName] = useState(""); const [issuer, setIssuer] = useState(""); const [limit, setLimit] = useState(0);
  const [closing, setClosing] = useState(10); const [due, setDue] = useState(17); const [acc, setAcc] = useState(accounts[0]?.id ?? "");
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => A.saveCard({ name, issuer: issuer || undefined, limit, closingDay: closing, dueDay: due, payAccountId: acc, color: "#7C3AED" }), () => { setName(""); setLimit(0); }); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do cartão" aria-label="Nome do cartão" required className={field} />
      <input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="Instituição emissora" aria-label="Emissor" className={field} />
      <p className="-mb-1 text-sm text-muted">Limite total</p>
      <MoneyInput cents={limit} onChange={setLimit} label="Limite total" className="!text-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-muted">Dia de fechamento<input type="number" min={1} max={31} value={closing} onChange={(e) => setClosing(Number(e.target.value))} className={`${field} mt-1`} /></label>
        <label className="text-sm text-muted">Dia de vencimento<input type="number" min={1} max={31} value={due} onChange={(e) => setDue(Number(e.target.value))} className={`${field} mt-1`} /></label>
      </div>
      <select value={acc} onChange={(e) => setAcc(e.target.value)} aria-label="Conta que paga a fatura" className={field}>{accounts.map((a) => <option key={a.id} value={a.id}>Paga com: {a.name}</option>)}</select>
      <Msg error={error} done={done} /><Submit pending={pending}>Criar cartão</Submit>
    </form>
  );
}

export function PayInvoiceForm({ invoiceId, remaining, today }: { invoiceId: string; remaining: number; today: string }) {
  const { error, pending, run } = useAction();
  const [amount, setAmount] = useState(remaining);
  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); run(() => A.pay({ invoiceId, amount, date: today })); }}>
      <MoneyInput cents={amount} onChange={setAmount} label="Valor do pagamento" className="!text-xl" />
      {error && <p role="alert" className="text-sm font-medium text-expense">{error}</p>}
      <Submit pending={pending}>{amount >= remaining ? "Pagar fatura" : "Pagar parcialmente"}</Submit>
    </form>
  );
}

export function CategoryForm() {
  const { error, done, pending, run } = useAction();
  const [name, setName] = useState(""); const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => A.saveCategory({ name, type, icon: "tag", color: "#64748B", favorite: false }), () => setName("")); }}>
      <div className="grid grid-cols-2 gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria" aria-label="Nome da categoria" required className={field} />
        <select value={type} onChange={(e) => setType(e.target.value as "INCOME" | "EXPENSE")} aria-label="Tipo" className={field}><option value="EXPENSE">Despesa</option><option value="INCOME">Receita</option></select>
      </div>
      <Msg error={error} done={done} /><Submit pending={pending}>Adicionar categoria</Submit>
    </form>
  );
}

export function RowAction({ label, confirm, onRun, tone = "muted" }: { label: string; confirm?: string; onRun: () => Promise<R>; tone?: "muted" | "danger" }) {
  const { error, pending, run } = useAction();
  return (
    <span className="inline-flex flex-col items-end">
      <button disabled={pending} onClick={() => { if (confirm && !window.confirm(confirm)) return; run(onRun); }}
        className={`min-h-10 px-2 text-sm font-semibold ${tone === "danger" ? "text-expense" : "text-accent"}`}>{label}</button>
      {error && <span role="alert" className="max-w-48 text-right text-xs text-expense">{error}</span>}
    </span>
  );
}

export function ThemeSelect({ value }: { value: string }) {
  const { pending, run } = useAction();
  return (
    <select defaultValue={value} disabled={pending} aria-label="Tema" onChange={(e) => run(() => A.setTheme(e.target.value as "system"))} className={field}>
      <option value="system">Automático (do aparelho)</option><option value="light">Claro</option><option value="dark">Escuro</option>
    </select>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return <button onClick={async () => { await A.logout(); router.replace("/login"); router.refresh(); }} className="rounded-md bg-surface-2 py-3.5 font-semibold">Sair</button>;
}
