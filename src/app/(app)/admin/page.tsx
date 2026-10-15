import { requireAdmin } from "@/server/auth";
import { listUsers, signupOpen } from "@/server/services/users";
import { Card } from "@/components/ui";
import { AddUserForm, SignupToggle, UserActions } from "./forms";

const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : "nunca");

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [list, open] = await Promise.all([listUsers(), signupOpen()]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Administração</h1>
      <p className="-mt-2 text-sm text-muted">Você gerencia as contas. Os dados financeiros de cada pessoa são privados: este painel mostra só quantidade de lançamentos, nunca valores ou descrições.</p>

      <Card title="Cadastro"><SignupToggle open={open} /></Card>

      <Card title={`Usuários (${list.length})`}>
        <ul className="divide-y divide-border">
          {list.map((u) => (
            <li key={u.id} className="flex flex-col gap-1 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u.name}{u.id === admin.id && " (você)"}</p>
                  <p className="truncate text-sm text-muted">{u.email}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  {u.role === "SUPER_ADMIN" && <span className="rounded-full bg-accent px-2 py-0.5 font-bold text-on-accent">Administrador</span>}
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${u.active ? "bg-income-bg text-income" : "bg-expense-bg text-expense"}`}>{u.active ? "Ativa" : "Desativada"}</span>
                  {u.mustChangePassword && <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold">Senha temporária</span>}
                </div>
              </div>
              <p className="text-xs text-muted">Criada em {when(u.createdAt)} · último acesso: {when(u.lastLoginAt)} · {u.transactions} lançamentos</p>
              <UserActions id={u.id} email={u.email} active={u.active} isSelf={u.id === admin.id} isAdmin={u.role === "SUPER_ADMIN"} />
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Convidar alguém"><AddUserForm /></Card>
    </div>
  );
}
