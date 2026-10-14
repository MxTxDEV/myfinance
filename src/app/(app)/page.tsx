import Link from "next/link";
import { requireOwner } from "@/server/auth";
import { prisma } from "@/server/db";
import { dashboard } from "@/server/services/reports";
import { generateRecurring } from "@/server/services/recurring";
import { listTransactions } from "@/server/services/ledger";
import { monthKey, monthRange, todayBR } from "@/domain/dates";
import { Money, HideToggle } from "@/components/privacy";
import { QuickButtons } from "@/components/quick-buttons";
import { Card, Empty, MonthNav } from "@/components/ui";
import { TxList } from "@/components/tx-list";
import { CashFlowChart } from "@/components/cash-flow-chart";

function greeting(h: number) { return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; }

export default async function Home({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const owner = await requireOwner();
  const sp = await searchParams;
  const today = todayBR();
  const month = sp.m && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) ? sp.m : monthKey(today);
  await generateRecurring(today); // idempotente
  const [d, recent, categories] = await Promise.all([
    dashboard(today, month),
    listTransactions({ sort: "date_desc" }),
    prisma.category.findMany({ where: { archivedAt: null } }),
  ]);
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date())) % 24;
  const { end } = monthRange(month);
  const days = Array.from({ length: end.getUTCDate() }, (_, i) => {
    const key = `${month}-${String(i + 1).padStart(2, "0")}`;
    const e = d.summary.byDay.find((x) => x.date === key);
    return { day: String(i + 1), income: e?.income ?? 0, expense: e?.expense ?? 0 };
  });
  const noAccounts = d.accounts.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{greeting(hour)}, {owner.name.split(" ")[0]}</h1>
          <MonthNav month={month} />
        </div>
        <HideToggle />
      </header>

      {noAccounts && (
        <Card>
          <Empty title="Comece criando sua primeira conta" hint="Cadastre uma conta ou carteira com o saldo atual para registrar receitas e gastos."
            action={<Link href="/perfil" className="rounded-md bg-accent px-5 py-3 font-bold text-on-accent">Criar conta</Link>} />
        </Card>
      )}

      <section aria-label="Saldo" className="rounded-lg border border-border bg-surface p-5">
        <p className="text-sm font-medium text-muted">Saldo disponível</p>
        <p className="mt-1 text-4xl font-bold tracking-tight"><Money cents={d.available} /></p>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted">
          <div><dt>Reservado</dt><dd className="font-semibold text-text"><Money cents={d.reserved} /></dd></div>
          <div><dt>Faturas</dt><dd className="font-semibold text-text"><Money cents={d.pendingInvoices} /></dd></div>
          <div><dt>Projetado</dt><dd className="font-semibold text-text"><Money cents={d.projected} /></dd></div>
        </dl>
      </section>

      <QuickButtons />

      <section aria-label="Resumo do mês" className="grid grid-cols-3 gap-2">
        {[["Receitas", d.summary.income, "text-income"], ["Despesas", d.summary.expense, "text-expense"], ["Resultado", d.summary.result, d.summary.result < 0 ? "text-expense" : "text-text"]].map(([l, v, c]) => (
          <div key={l as string} className="rounded-md border border-border bg-surface p-3">
            <p className="text-xs font-medium text-muted">{l}</p>
            <p className={`mt-1 text-[15px] font-bold ${c}`}><Money cents={v as number} /></p>
          </div>
        ))}
      </section>

      <Card title="Fluxo financeiro">
        {d.summary.byDay.length === 0 ? <Empty title="Sem movimentações neste mês" hint="Registre uma receita ou um gasto para ver o gráfico." /> : <CashFlowChart data={days} />}
      </Card>

      <Card title="Próximos compromissos">
        {d.upcoming.length === 0 ? (
          <Empty title="Nada a vencer nos próximos 30 dias" hint="Cadastre contas fixas e recebimentos previstos em Planejamento." />
        ) : (
          <ul className="divide-y divide-border">
            {d.upcoming.slice(0, 6).map((u) => (
              <li key={u.kind + u.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.description}</p>
                  <p className={`text-xs ${u.overdue ? "font-semibold text-expense" : "text-muted"}`}>{u.overdue ? "Atrasado · " : ""}{u.date.split("-").reverse().join("/")}</p>
                </div>
                <Money cents={u.type === "INCOME" ? u.amount : -u.amount} sign className={`font-bold ${u.type === "INCOME" ? "text-income" : "text-expense"}`} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section aria-label="Últimas movimentações">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="font-bold">Últimas movimentações</h2>
          <Link href="/movimentacoes" className="text-sm font-semibold text-accent">Ver todas</Link>
        </div>
        {recent.items.length === 0 ? (
          <Card><Empty title="Nenhuma movimentação ainda" hint="Toque em RECEBI ou GASTEI para registrar a primeira." /></Card>
        ) : (
          <TxList items={recent.items.slice(0, 6)} categories={categories} grouped={false} />
        )}
      </section>
    </div>
  );
}
