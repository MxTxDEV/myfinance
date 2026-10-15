"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { field } from "@/components/form-kit";
import { adminAddUser, adminRemoveUser, adminResetPassword, adminSetActive, adminSetSignup, adminTransferData } from "./actions";

function TempPassword({ email, value, onClose }: { email: string; value: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="alertdialog" aria-label="Senha temporária" className="flex flex-col gap-2 rounded-md border border-accent bg-surface-2 p-3 text-sm">
      <p><b>{email}</b> — senha temporária (aparece só agora, anote ou envie à pessoa):</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-surface px-2 py-2 text-base font-semibold">{value}</code>
        <button onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); } catch { /* sem permissão */ } }} className="flex items-center gap-1 rounded-md bg-accent px-3 py-2 font-semibold text-on-accent"><Copy className="size-4" aria-hidden />{copied ? "Copiado" : "Copiar"}</button>
      </div>
      <p className="text-muted">No primeiro acesso a pessoa será obrigada a criar uma senha própria.</p>
      <button onClick={onClose} className="self-end font-semibold text-accent">Fechar</button>
    </div>
  );
}

export function AddUserForm() {
  const router = useRouter();
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ email: string; value: string } | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        const r = await adminAddUser(name, email);
        setBusy(false);
        if (!r.ok) return setError(r.error);
        setTemp({ email: r.data!.email, value: r.data!.tempPassword }); setName(""); setEmail(""); router.refresh();
      }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" aria-label="Nome do novo usuário" required className={field} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail" aria-label="E-mail do novo usuário" required className={field} />
        {error && <p role="alert" className="text-sm font-medium text-expense">{error}</p>}
        <button disabled={busy} className="rounded-md bg-accent py-3.5 font-bold text-on-accent disabled:opacity-60">{busy ? "Criando…" : "Criar conta com senha temporária"}</button>
      </form>
      {temp && <TempPassword email={temp.email} value={temp.value} onClose={() => setTemp(null)} />}
    </div>
  );
}

export function UserActions({ id, email, active, isSelf, isAdmin, hasData }: { id: string; email: string; active: boolean; isSelf: boolean; isAdmin: boolean; hasData: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [temp, setTemp] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, after?: (d: unknown) => void) => {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "Erro");
    after?.(r.data); router.refresh();
  };
  const btn = "min-h-10 px-2 text-sm font-semibold";
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end">
        {!isSelf && hasData && <button disabled={busy} className={`${btn} text-accent`} onClick={() => { if (window.confirm(`Trazer TODOS os dados de ${email} para a sua conta de administrador? O que a sua conta tem hoje (categorias padrão, contas vazias) será substituído.`)) void run(() => adminTransferData(id)); }}>Trazer dados para mim</button>}
        {!isSelf && <button disabled={busy} className={`${btn} text-accent`} onClick={() => run(() => adminSetActive(id, !active))}>{active ? "Desativar" : "Reativar"}</button>}
        {!isAdmin && <button disabled={busy} className={`${btn} text-accent`} onClick={() => { if (window.confirm(`Gerar nova senha temporária para ${email}? As sessões dela serão encerradas.`)) void run(() => adminResetPassword(id), (d) => setTemp((d as { tempPassword: string }).tempPassword)); }}>Nova senha</button>}
        {!isAdmin && <button disabled={busy} className={`${btn} text-expense`} onClick={() => { if (window.confirm(`Excluir ${email} e TODOS os dados financeiros dela? Isso não pode ser desfeito.`)) void run(() => adminRemoveUser(id)); }}>Excluir</button>}
      </div>
      {error && <p role="alert" className="max-w-56 text-right text-xs text-expense">{error}</p>}
      {temp && <TempPassword email={email} value={temp} onClose={() => setTemp(null)} />}
    </div>
  );
}

export function SignupToggle({ open }: { open: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" className="mt-0.5 size-5" checked={open} disabled={busy} onChange={async (e) => { setBusy(true); await adminSetSignup(e.target.checked); setBusy(false); router.refresh(); }} />
      <span><span className="font-medium">Cadastro aberto</span><span className="block text-xs text-muted">Qualquer pessoa com o link pode criar uma conta. Desligue para aceitar só contas criadas por você.</span></span>
    </label>
  );
}
