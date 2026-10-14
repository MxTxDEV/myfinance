"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

const sel = "rounded-full border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 ring-accent";

export function Filters({ categories, accounts }: { categories: { id: string; name: string }[]; accounts: { id: string; name: string }[] }) {
  const router = useRouter(), path = usePathname(), sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v); else n.delete(k);
    n.delete("page");
    router.replace(`${path}?${n}`);
  };
  useEffect(() => { // busca com debounce
    const t = setTimeout(() => { if ((sp.get("q") ?? "") !== q) set("q", q); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const opt = (k: string) => sp.get(k) ?? "";
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 rounded-md bg-surface-2 px-4 py-3">
        <Search className="size-5 text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por descrição" aria-label="Buscar por descrição" className="w-full bg-transparent outline-none" />
      </label>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtros">
        <select aria-label="Tipo" value={opt("type")} onChange={(e) => set("type", e.target.value)} className={sel}>
          <option value="">Tipo</option><option value="INCOME">Receitas</option><option value="EXPENSE">Despesas</option><option value="TRANSFER">Transferências</option>
        </select>
        <select aria-label="Situação" value={opt("status")} onChange={(e) => set("status", e.target.value)} className={sel}>
          <option value="">Situação</option><option value="SETTLED">Pago/recebido</option><option value="PLANNED">Previsto</option>
        </select>
        <select aria-label="Categoria" value={opt("categoryId")} onChange={(e) => set("categoryId", e.target.value)} className={sel}>
          <option value="">Categoria</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Conta" value={opt("accountId")} onChange={(e) => set("accountId", e.target.value)} className={sel}>
          <option value="">Conta</option>{accounts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Ordenar" value={opt("sort")} onChange={(e) => set("sort", e.target.value)} className={sel}>
          <option value="">Mais recentes</option><option value="date_asc">Mais antigas</option><option value="amount_desc">Maior valor</option><option value="amount_asc">Menor valor</option>
        </select>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <label className="flex items-center gap-1 text-muted">De <input type="date" aria-label="De" value={opt("from")} onChange={(e) => set("from", e.target.value)} className={sel} /></label>
        <label className="flex items-center gap-1 text-muted">até <input type="date" aria-label="Até" value={opt("to")} onChange={(e) => set("to", e.target.value)} className={sel} /></label>
      </div>
    </div>
  );
}
