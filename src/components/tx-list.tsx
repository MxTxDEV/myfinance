"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, CreditCard, X } from "lucide-react";
import { Money } from "./privacy";
import { CategoryIcon } from "./icons";
import { MoneyInput } from "./money-input";
import { copyTransaction, editTransaction, editTransfer, removeTransaction, settle } from "@/app/(app)/actions";
import type { LedgerItem } from "@/server/services/ledger";

export interface CatOpt { id: string; name: string; type: "INCOME" | "EXPENSE" }
const field = "w-full rounded-md bg-surface-2 px-4 py-3 text-base outline-none focus-visible:ring-2 ring-accent";
const incomeLike = (t: string) => t === "INCOME" || t === "TRANSFER_IN" || t === "INVESTMENT_IN";

function fmtDay(iso: string) {
  const dt = new Date(iso + "T12:00:00Z");
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(dt).toUpperCase();
}

export function TxList({ items, categories, accounts = [], grouped = true }: { items: LedgerItem[]; categories: CatOpt[]; accounts?: { id: string; name: string }[]; grouped?: boolean }) {
  const [sel, setSel] = useState<LedgerItem | null>(null);
  const groups = grouped ? [...Map.groupBy(items, (i) => i.date)] : [["", items] as const];
  return (
    <>
      {groups.map(([day, list]) => (
        <section key={day || "all"} className="mb-4">
          {day && <h3 className="mb-1.5 px-1 text-[11px] font-semibold tracking-wider text-muted">{fmtDay(day)}</h3>}
          <ul className="divide-y divide-border rounded-md border border-border bg-surface px-4">
            {list.map((t) => <li key={t.id}><Row t={t} onOpen={() => setSel(t)} /></li>)}
          </ul>
        </section>
      ))}
      {sel && <Detail t={sel} categories={categories} accounts={accounts} onClose={() => setSel(null)} />}
    </>
  );
}

function Row({ t, onOpen }: { t: LedgerItem; onOpen: () => void }) {
  const inc = t.type === "INCOME";
  const transfer = t.type === "TRANSFER_OUT" || t.type === "TRANSFER_IN" || t.type === "INVESTMENT_IN" || t.type === "INVESTMENT_OUT"; // movimentos neutros (não são receita nem despesa)
  const out = !incomeLike(t.type);
  return (
    <button onClick={onOpen} className="flex min-h-16 w-full items-center gap-3 py-3 text-left">
      <span className={`grid size-11 shrink-0 place-items-center rounded-[14px] ${transfer ? "bg-surface-2 text-muted" : inc ? "bg-income-bg text-income" : "bg-expense-bg text-expense"}`}>
        {transfer ? <ArrowLeftRight className="size-5" aria-hidden /> : t.cardId ? <CreditCard className="size-5" aria-hidden /> : <CategoryIcon name={t.categoryIcon} className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{t.description}</span>
        <span className="block truncate text-xs text-muted">
          {[t.categoryName, t.accountName, t.status === "PLANNED" ? "Previsto" : null].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className={`shrink-0 font-bold ${transfer ? "text-text" : inc ? "text-income" : "text-expense"} ${t.status === "PLANNED" ? "opacity-70" : ""}`}>
        <Money cents={out && !transfer ? -t.amount : t.amount} sign={!transfer} />
        <span className="sr-only">{transfer ? " transferência" : inc ? " receita" : " despesa"}</span>
      </span>
    </button>
  );
}

function Detail({ t, categories, accounts, onClose }: { t: LedgerItem; categories: CatOpt[]; accounts: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [desc, setDesc] = useState(t.description);
  const [amount, setAmount] = useState(t.amount);
  const [date, setDate] = useState(t.date);
  const [cat, setCat] = useState(t.categoryId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const locked = t.type !== "INCOME" && t.type !== "EXPENSE";
  const isTransfer = t.type === "TRANSFER_OUT" && !!t.transfer;
  const [from, setFrom] = useState(t.transfer?.fromAccountId ?? "");
  const [to, setTo] = useState(t.transfer?.toAccountId ?? "");
  const isPlan = !!t.installment;

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => { const r = await fn(); if (!r.ok) return setError(r.error ?? "Erro"); router.refresh(); onClose(); });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Detalhes da movimentação" onClick={(e) => e.stopPropagation()}
        className="sheet flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-lg bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-lg">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{t.description}</p>
            <p className="text-sm text-muted">{[t.categoryName, t.accountName].filter(Boolean).join(" · ")}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2"><X className="size-5" /></button>
        </div>

        {!edit ? (
          <>
            <p className={`text-4xl font-bold ${incomeLike(t.type) ? "text-income" : "text-expense"}`}><Money cents={incomeLike(t.type) ? t.amount : -t.amount} sign /></p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted">Data</dt><dd className="font-medium">{t.date.split("-").reverse().join("/")}</dd></div>
              <div><dt className="text-muted">Situação</dt><dd className="font-medium">{t.status === "PLANNED" ? "Previsto" : incomeLike(t.type) ? "Recebido" : "Pago"}</dd></div>
              {t.dueDate && <div><dt className="text-muted">Vencimento</dt><dd className="font-medium">{t.dueDate.split("-").reverse().join("/")}</dd></div>}
              {t.payerSource && <div><dt className="text-muted">Fonte pagadora</dt><dd className="font-medium">{t.payerSource}</dd></div>}
              {t.notes && <div className="col-span-2"><dt className="text-muted">Observações</dt><dd>{t.notes}</dd></div>}
            </dl>
            {error && <p role="alert" className="text-sm font-medium text-expense">{error}</p>}
            {confirmDel ? (
              <div className="flex flex-col gap-3 rounded-md bg-expense-bg p-4" role="alertdialog" aria-label="Confirmar exclusão">
                <p className="text-sm font-medium">
                  {t.transferId ? "Excluir esta transferência removerá as duas pontas." : t.type.startsWith("INVESTMENT") ? "Excluir desfaz o aporte/resgate: o valor volta para a conta e o investimento é ajustado." : isPlan ? "Excluir removerá todas as parcelas desta compra." : "Excluir esta movimentação? O saldo será recalculado."}
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmDel(false)} className="flex-1 rounded-md bg-surface py-3 font-semibold">Cancelar</button>
                  <button disabled={pending} onClick={() => act(() => removeTransaction(t.id))} className="flex-1 rounded-md bg-expense py-3 font-bold text-on-accent">Excluir</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {t.status === "PLANNED" && <button disabled={pending} onClick={() => act(() => settle(t.id))} className="col-span-2 rounded-md bg-accent py-3.5 font-bold text-on-accent">{incomeLike(t.type) ? "Marcar como recebido" : "Marcar como pago"}</button>}
                {(!locked || isTransfer) && <button onClick={() => setEdit(true)} className="rounded-md bg-surface-2 py-3.5 font-semibold">Editar</button>}
                {!locked && <button disabled={pending} onClick={() => act(() => copyTransaction(t.id))} className="rounded-md bg-surface-2 py-3.5 font-semibold">Duplicar</button>}
                <button onClick={() => setConfirmDel(true)} className={`rounded-md bg-expense-bg py-3.5 font-semibold text-expense ${locked ? "col-span-2" : "col-span-2"}`}>Excluir</button>
              </div>
            )}
          </>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); setError(null);
            if (isTransfer) return act(() => editTransfer(t.transferId!, { fromAccountId: from, toAccountId: to, amount, date, description: desc }));
            act(() => editTransaction(t.id, { description: desc, categoryId: cat || undefined, ...(isPlan ? {} : { amount, date }) })); }}>
            {!isPlan && <MoneyInput cents={amount} onChange={setAmount} className={incomeLike(t.type) ? "text-income" : "text-expense"} />}
            <input value={desc} onChange={(e) => setDesc(e.target.value)} aria-label="Descrição" className={field} maxLength={120} />
            {isTransfer ? (
              <div className="grid grid-cols-2 gap-3">
                <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Conta de origem" className={field}>{accounts.map((a) => <option key={a.id} value={a.id}>De: {a.name}</option>)}</select>
                <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Conta de destino" className={field}>{accounts.map((a) => <option key={a.id} value={a.id}>Para: {a.name}</option>)}</select>
              </div>
            ) : <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria" className={field}>
              {categories.filter((c) => c.type === t.type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>}
            {!isPlan && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data" className={field} />}
            {isPlan && <p className="text-xs text-muted">Valor e data de compras parceladas não podem ser editados; exclua e recadastre.</p>}
            {error && <p role="alert" className="text-sm font-medium text-expense">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setEdit(false)} className="flex-1 rounded-md bg-surface-2 py-3.5 font-semibold">Voltar</button>
              <button disabled={pending} className="flex-1 rounded-md bg-accent py-3.5 font-bold text-on-accent">{pending ? "Salvando…" : "Salvar"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
