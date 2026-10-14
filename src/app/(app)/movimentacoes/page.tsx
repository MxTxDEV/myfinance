import Link from "next/link";
import { prisma } from "@/server/db";
import { listTransactions, type LedgerFilters } from "@/server/services/ledger";
import { Filters } from "@/components/filters";
import { TxList } from "@/components/tx-list";
import { Card, Empty } from "@/components/ui";
import { Money } from "@/components/privacy";

type SP = Record<string, string | undefined>;
const pick = <T extends string>(v: string | undefined, ok: readonly T[]): T | undefined => (ok as readonly string[]).includes(v ?? "") ? (v as T) : undefined;
const isoRe = /^\d{4}-\d{2}-\d{2}$/;

export default async function Movimentacoes({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f: LedgerFilters = {
    q: sp.q?.slice(0, 80) || undefined,
    from: sp.from && isoRe.test(sp.from) ? sp.from : undefined, to: sp.to && isoRe.test(sp.to) ? sp.to : undefined,
    categoryId: sp.categoryId || undefined, accountId: sp.accountId || undefined,
    type: pick(sp.type, ["INCOME", "EXPENSE", "TRANSFER"] as const), status: pick(sp.status, ["PLANNED", "SETTLED"] as const),
    sort: pick(sp.sort, ["date_desc", "date_asc", "amount_desc", "amount_asc"] as const),
    page: Math.max(0, Number(sp.page) || 0),
  };
  const [res, categories, accounts] = await Promise.all([
    listTransactions(f),
    prisma.category.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.account.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
  ]);
  const qs = (p: number) => { const n = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]); n.set("page", String(p)); return `?${n}`; };
  const byAmount = f.sort?.startsWith("amount");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Movimentações</h1>
      <Filters categories={categories} accounts={accounts} />
      <div className="flex items-center justify-between rounded-md bg-surface-2 px-4 py-3 text-sm font-semibold" aria-live="polite">
        <span className="text-income">Entradas <Money cents={res.totals.income} /></span>
        <span className="text-expense">Saídas <Money cents={-res.totals.expense} /></span>
        <span className="text-muted">{res.total} itens</span>
      </div>
      {res.items.length === 0 ? (
        <Card><Empty title="Nada encontrado" hint="Ajuste os filtros ou registre uma nova movimentação." /></Card>
      ) : (
        <TxList items={res.items} categories={categories} accounts={accounts} grouped={!byAmount} />
      )}
      <div className="flex justify-between">
        {res.page > 0 ? <Link href={qs(res.page - 1)} className="rounded-md bg-surface-2 px-4 py-3 font-semibold">← Anteriores</Link> : <span />}
        {res.hasMore && <Link href={qs(res.page + 1)} className="rounded-md bg-surface-2 px-4 py-3 font-semibold">Mais antigas →</Link>}
      </div>
    </div>
  );
}
