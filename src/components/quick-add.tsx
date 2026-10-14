"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, X } from "lucide-react";
import { MoneyInput } from "./money-input";
import { CategoryIcon } from "./icons";
import { getSuggestions, saveTransaction } from "@/app/(app)/actions";

export interface QuickAddData {
  today: string;
  categories: { id: string; name: string; type: "INCOME" | "EXPENSE"; icon: string; favorite: boolean }[];
  accounts: { id: string; name: string }[];
  cards: { id: string; name: string }[];
}
type Kind = "INCOME" | "EXPENSE";
const Ctx = createContext<(k?: Kind) => void>(() => {});
export const useQuickAdd = () => useContext(Ctx);

export function QuickAddProvider({ data, children }: { data: QuickAddData; children: React.ReactNode }) {
  const [open, setOpen] = useState<Kind | null>(null);
  const [nonce, setNonce] = useState(0); // remonta o formulário a cada abertura
  const openAdd = useCallback((k: Kind = "EXPENSE") => { setNonce((n) => n + 1); setOpen(k); }, []);
  return (
    <Ctx.Provider value={openAdd}>
      {children}
      {open && <Sheet key={nonce} data={data} initial={open} onClose={() => setOpen(null)} />}
    </Ctx.Provider>
  );
}

const field = "w-full rounded-md bg-surface-2 px-4 py-3 text-base outline-none focus-visible:ring-2 ring-accent";

function Sheet({ data, initial, onClose }: { data: QuickAddData; initial: Kind; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(initial);
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [touchedCat, setTouchedCat] = useState(false);
  const [date, setDate] = useState(data.today);
  const [target, setTarget] = useState<string>(""); // "acc:ID" | "card:ID"
  const [more, setMore] = useState(false);
  const [planned, setPlanned] = useState(false);
  const [installments, setInstallments] = useState(1);
  const [payer, setPayer] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [sugs, setSugs] = useState<{ description: string; categoryId: string | null }[]>([]);
  const [pending, start] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  const cats = data.categories.filter((c) => c.type === kind);
  const favs = cats.filter((c) => c.favorite).slice(0, 6);
  const isCard = target.startsWith("card:");

  const firstAccount = data.accounts[0]?.id;
  useEffect(() => { // defaults ao trocar o tipo (deps primitivas: refresh do servidor não reseta o formulário)
    setCategoryId(""); setTouchedCat(false); setPlanned(false); setInstallments(1);
    setTarget(firstAccount ? `acc:${firstAccount}` : "");
    getSuggestions(kind).then((r) => r.ok && setSugs(r.data ?? []));
  }, [kind, firstAccount]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onDescription(v: string) {
    setDescription(v);
    const m = sugs.find((s) => s.description.toLowerCase() === v.toLowerCase());
    if (m?.categoryId && !touchedCat && cats.some((c) => c.id === m.categoryId)) setCategoryId(m.categoryId); // sugerida, editável
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (amount <= 0) return setError("Informe o valor");
    if (!categoryId) return setError("Escolha uma categoria");
    if (!target) return setError("Cadastre uma conta em Perfil para começar");
    const [tkind, tid] = target.split(":");
    start(async () => {
      const r = await saveTransaction({
        type: kind, amount, description: description.trim() || cats.find((c) => c.id === categoryId)!.name, date, categoryId,
        status: planned && tkind === "acc" ? "PLANNED" : "SETTLED",
        ...(tkind === "card" ? { cardId: tid, installments } : { accountId: tid, installments: 1 }),
        payerSource: payer || undefined, notes: notes || undefined, dueDate: due || undefined,
      });
      if (!r.ok) return setError(r.error);
      setSaved(true);
      router.refresh();
    });
  }

  function again() {
    setSaved(false); setAmount(0); setDescription(""); setCategoryId(""); setTouchedCat(false); setNotes(""); setPayer(""); setDue(""); setInstallments(1);
  }

  const tone = kind === "INCOME" ? "income" : "expense";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-label={kind === "INCOME" ? "Registrar receita" : "Registrar despesa"}
        onClick={(e) => e.stopPropagation()}
        className="sheet flex max-h-[94dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-lg bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-lg"
      >
        {saved ? (
          <div role="status" className="flex flex-col items-center gap-4 py-8 text-center pop">
            <span className={`grid size-16 place-items-center rounded-full ${kind === "INCOME" ? "bg-income-bg text-income" : "bg-expense-bg text-expense"}`}><Check className="size-8" /></span>
            <p className="text-lg font-bold">{kind === "INCOME" ? "Receita registrada" : "Despesa registrada"}</p>
            <div className="flex w-full gap-3">
              <button onClick={again} className="flex-1 rounded-md bg-surface-2 py-3.5 font-semibold">Registrar outra</button>
              <button onClick={onClose} className="flex-1 rounded-md bg-accent py-3.5 font-semibold text-on-accent">Concluir</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div role="tablist" aria-label="Tipo" className="grid flex-1 grid-cols-2 gap-1 rounded-md bg-surface-2 p-1">
                {(["INCOME", "EXPENSE"] as const).map((k) => (
                  <button type="button" role="tab" aria-selected={kind === k} key={k} onClick={() => setKind(k)}
                    className={`rounded-sm py-2.5 text-sm font-bold ${kind === k ? (k === "INCOME" ? "bg-income text-on-accent" : "bg-expense text-on-accent") : "text-muted"}`}>
                    {k === "INCOME" ? "Recebi" : "Gastei"}
                  </button>
                ))}
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar" className="ml-2 grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2"><X className="size-5" /></button>
            </div>

            <div>
              <MoneyInput cents={amount} onChange={setAmount} autoFocus className={tone === "income" ? "text-income" : "text-expense"} />
            </div>

            <input list="desc-sugs" value={description} onChange={(e) => onDescription(e.target.value)} placeholder="Descrição (ex.: Mercado)" aria-label="Descrição" maxLength={120} className={field} />
            <datalist id="desc-sugs">{sugs.map((s) => <option key={s.description} value={s.description} />)}</datalist>

            <div>
              <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Categorias favoritas">
                {favs.map((c) => (
                  <button type="button" key={c.id} aria-pressed={categoryId === c.id} onClick={() => { setCategoryId(c.id); setTouchedCat(true); }}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium ${categoryId === c.id ? "border-accent bg-accent text-on-accent" : "border-border"}`}>
                    <CategoryIcon name={c.icon} className="size-4" />{c.name}
                  </button>
                ))}
              </div>
              <select aria-label="Categoria" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setTouchedCat(true); }} className={field}>
                <option value="">Categoria…</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input type="date" aria-label="Data" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
              <select aria-label={kind === "INCOME" ? "Conta de destino" : "Conta ou cartão"} value={target} onChange={(e) => setTarget(e.target.value)} className={field}>
                {data.accounts.length === 0 && <option value="">Sem contas</option>}
                <optgroup label="Contas">{data.accounts.map((a) => <option key={a.id} value={`acc:${a.id}`}>{a.name}</option>)}</optgroup>
                {kind === "EXPENSE" && data.cards.length > 0 && <optgroup label="Cartões">{data.cards.map((c) => <option key={c.id} value={`card:${c.id}`}>{c.name}</option>)}</optgroup>}
              </select>
            </div>

            <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="flex items-center gap-1 self-start text-sm font-semibold text-accent">
              Mais detalhes <ChevronDown className={`size-4 transition ${more ? "rotate-180" : ""}`} />
            </button>
            {more && (
              <div className="flex flex-col gap-3 pop">
                {!isCard && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={planned} onChange={(e) => setPlanned(e.target.checked)} className="size-5" />
                    {kind === "INCOME" ? "Ainda não recebi (prevista)" : "Ainda não paguei (prevista)"}
                  </label>
                )}
                {isCard && (
                  <label className="text-sm text-muted">Parcelas
                    <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className={`${field} mt-1`}>
                      {[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((n) => <option key={n} value={n}>{n === 1 ? "À vista" : `${n}x`}</option>)}
                    </select>
                  </label>
                )}
                {kind === "INCOME" && <input value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="Fonte pagadora" aria-label="Fonte pagadora" className={field} />}
                {kind === "EXPENSE" && !isCard && <label className="text-sm text-muted">Vencimento<input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${field} mt-1`} /></label>}
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações" aria-label="Observações" rows={2} maxLength={500} className={field} />
              </div>
            )}

            {error && <p role="alert" className="text-sm font-medium text-expense">{error}</p>}
            <button disabled={pending} className={`rounded-md py-4 text-base font-bold text-on-accent disabled:opacity-60 ${tone === "income" ? "bg-income" : "bg-expense"}`}>
              {pending ? "Salvando…" : kind === "INCOME" ? "Salvar receita" : "Salvar gasto"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
