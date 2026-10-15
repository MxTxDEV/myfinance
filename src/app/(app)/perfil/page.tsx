import { requireOwner } from "@/server/auth";
import { prisma } from "@/server/db";
import { accountBalances } from "@/server/services/accounts";
import { cardOverview } from "@/server/services/cards";
import { todayBR } from "@/domain/dates";
import { Money } from "@/components/privacy";
import { Card, Empty } from "@/components/ui";
import { ImportStatement } from "@/components/import-statement";
import { archiveAccount, archiveCard, archiveCategory, favoriteCategory } from "../actions";
import { AccountForm, CardForm, CategoryForm, LogoutButton, PayInvoiceForm, RowAction, ThemeSelect, TransferForm } from "./forms";

const STATUS: Record<string, string> = { OPEN: "Aberta", CLOSED: "Fechada", PAID: "Paga", PARTIAL: "Parcial", OVERDUE: "Atrasada" };

export default async function Perfil() {
  const owner = await requireOwner();
  const today = todayBR();
  const iso = today.toISOString().slice(0, 10);
  const [accounts, cards, categories] = await Promise.all([
    accountBalances(), cardOverview(today),
    prisma.category.findMany({ where: { archivedAt: null }, orderBy: [{ type: "asc" }, { favorite: "desc" }, { name: "asc" }] }),
  ]);
  const det = "group rounded-md border border-border bg-surface";
  const sm = "flex cursor-pointer items-center justify-between p-4 font-bold";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Perfil</h1>
      <p className="-mt-2 text-sm text-muted">{owner.name} · {owner.email}</p>

      <Card title="Contas">
        {accounts.length === 0 ? <Empty title="Nenhuma conta" hint="Crie sua primeira conta abaixo." /> : (
          <ul className="divide-y divide-border">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0"><p className="truncate font-semibold">{a.name}</p><p className="text-xs text-muted">{a.institution ?? ""}</p></div>
                <div className="flex items-center gap-1"><Money cents={a.balance} className={`font-bold ${a.balance < 0 ? "text-expense" : ""}`} />
                  <RowAction label="Arquivar" tone="danger" confirm="Arquivar esta conta? O histórico é mantido." onRun={archiveAccount.bind(null, a.id)} /></div>
              </li>
            ))}
          </ul>
        )}
        <details className="mt-3"><summary className="cursor-pointer py-2 font-semibold text-accent">Nova conta</summary><div className="pt-3"><AccountForm today={iso} /></div></details>
      </Card>

      {accounts.length >= 2 && (
        <details className={det}><summary className={sm}>Transferir entre contas</summary><div className="p-4 pt-0"><TransferForm accounts={accounts} today={iso} /></div></details>
      )}

      <Card title="Cartões de crédito">
        {cards.length === 0 ? <Empty title="Nenhum cartão" hint={accounts.length ? "Cadastre um cartão para acompanhar faturas e parcelas." : "Crie uma conta antes de cadastrar um cartão."} /> : (
          <ul className="flex flex-col gap-3">
            {cards.map((c) => (
              <li key={c.id} className="rounded-md border border-border p-4">
                <div className="flex items-center justify-between"><p className="font-bold">{c.name}</p>
                  <RowAction label="Arquivar" tone="danger" confirm="Arquivar este cartão?" onRun={archiveCard.bind(null, c.id)} /></div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
                  <div><dt>Limite</dt><dd className="font-semibold text-text"><Money cents={c.limit} /></dd></div>
                  <div><dt>Usado</dt><dd className="font-semibold text-text"><Money cents={c.used} /></dd></div>
                  <div><dt>Disponível</dt><dd className="font-semibold text-text"><Money cents={c.available} /></dd></div>
                </dl>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Limite usado: ${c.limit ? Math.round((c.used / c.limit) * 100) : 0}%`}>
                  <div className="h-full bg-accent" style={{ width: `${c.limit ? Math.min(100, (c.used / c.limit) * 100) : 0}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted">Fecha dia {c.closingDay} · vence dia {c.dueDay}</p>
                {c.invoices.filter((i) => i.total > 0).length > 0 && (
                  <ul className="mt-3 divide-y divide-border text-sm">
                    {c.invoices.filter((i) => i.total > 0).map((i) => (
                      <li key={i.id} className="py-2">
                        <div className="flex justify-between"><span>Fatura {i.referenceMonth.split("-").reverse().join("/")} <span className="text-xs text-muted">· {STATUS[i.status]}</span></span>
                          <span className="font-semibold"><Money cents={i.total} /></span></div>
                        <p className="text-xs text-muted">Vence {i.dueDate.split("-").reverse().join("/")} · pago <Money cents={i.paid} /></p>
                        {i.remaining > 0 && (
                          <details className="mt-1"><summary className="cursor-pointer font-semibold text-accent">Pagar</summary><div className="pt-2"><PayInvoiceForm invoiceId={i.id} remaining={i.remaining} today={iso} /></div></details>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        {accounts.length > 0 && <details className="mt-3"><summary className="cursor-pointer py-2 font-semibold text-accent">Novo cartão</summary><div className="pt-3"><CardForm accounts={accounts} /></div></details>}
      </Card>

      {(accounts.length > 0 || cards.length > 0) && (
        <details className={det}>
          <summary className={sm}>Importar extrato do banco ou fatura</summary>
          <div className="p-4 pt-0"><ImportStatement accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} cards={cards.map((c) => ({ id: c.id, name: c.name }))} categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))} /></div>
        </details>
      )}

      <details className={det}>
        <summary className={sm}>Categorias</summary>
        <div className="flex flex-col gap-3 p-4 pt-0">
          <ul className="divide-y divide-border">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-1.5">
                <span><span className={c.type === "INCOME" ? "text-income" : "text-expense"} aria-hidden>●</span> {c.name} <span className="text-xs text-muted">{c.type === "INCOME" ? "receita" : "despesa"}</span></span>
                <span><RowAction label={c.favorite ? "★ Favorita" : "☆ Favoritar"} onRun={favoriteCategory.bind(null, c.id)} /><RowAction label="Arquivar" tone="danger" confirm="Arquivar categoria? Movimentações antigas continuam." onRun={archiveCategory.bind(null, c.id)} /></span>
              </li>
            ))}
          </ul>
          <CategoryForm />
        </div>
      </details>

      <Card title="Aparência e dados">
        <div className="flex flex-col gap-3">
          <ThemeSelect value={owner.theme} />
          <a href="/api/export/transactions.csv" className="rounded-md bg-surface-2 py-3.5 text-center font-semibold">Exportar movimentações (CSV)</a>
          <a href="/api/export/all.json" className="rounded-md bg-surface-2 py-3.5 text-center font-semibold">Exportar todos os dados (JSON)</a>
          <LogoutButton />
        </div>
      </Card>
    </div>
  );
}
