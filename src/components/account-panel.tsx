"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Msg, field, useAction } from "./form-kit";
import { deleteMyAccount, newApiToken, removeApiToken, renameMe } from "@/app/(app)/actions";

/** Dados da conta: nome, senha, administração e exclusão da conta. */
export function AccountPanel({ name, email, isAdmin }: { name: string; email: string; isAdmin: boolean }) {
  const router = useRouter();
  const rename = useAction();
  const [n, setN] = useState(name);
  const [confirm, setConfirm] = useState(false);
  const [pw, setPw] = useState(""); const [typed, setTyped] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{email}</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); rename.run(() => renameMe(n)); }}>
        <input value={n} onChange={(e) => setN(e.target.value)} aria-label="Seu nome" required maxLength={80} className={field} />
        <button disabled={rename.pending || n.trim() === name} className="shrink-0 rounded-md bg-surface-2 px-4 font-semibold disabled:opacity-50">Salvar</button>
      </form>
      <Msg error={rename.error} done={rename.done} />
      <Link href="/senha" className="rounded-md bg-surface-2 py-3.5 text-center font-semibold">Trocar senha</Link>
      {isAdmin && <Link href="/admin" className="rounded-md bg-accent py-3.5 text-center font-bold text-on-accent">Painel do administrador</Link>}
      {!confirm ? (
        <button onClick={() => setConfirm(true)} className="rounded-md bg-expense-bg py-3.5 font-semibold text-expense">Excluir minha conta e meus dados</button>
      ) : (
        <form className="flex flex-col gap-2 rounded-md bg-expense-bg p-3" role="alertdialog" aria-label="Confirmar exclusão da conta" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null);
          const r = await deleteMyAccount(pw);
          setBusy(false);
          if (!r.ok) return setErr(r.error);
          router.replace("/login"); router.refresh();
        }}>
          <p className="text-sm font-medium">Isso apaga <b>tudo</b> (contas, lançamentos, metas…) e não dá para desfazer. Baixe uma cópia em “Exportar todos os dados” antes, se quiser.</p>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Sua senha" aria-label="Senha para excluir a conta" autoComplete="current-password" className={field} />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Digite EXCLUIR" aria-label="Digite EXCLUIR para confirmar" className={field} />
          {err && <p role="alert" className="text-sm font-medium text-expense">{err}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirm(false)} className="flex-1 rounded-md bg-surface py-3 font-semibold">Cancelar</button>
            <button disabled={busy || typed !== "EXCLUIR" || !pw} className="flex-1 rounded-md bg-expense py-3 font-bold text-on-accent disabled:opacity-50">{busy ? "Excluindo…" : "Excluir tudo"}</button>
          </div>
        </form>
      )}
    </div>
  );
}

interface Tok { id: string; label: string; createdAt: string; lastUsedAt: string | null }

/** Chaves para lançamentos automáticos (Atalhos do iPhone, Tasker…). */
export function AutomationPanel({ tokens }: { tokens: Tok[] }) {
  const router = useRouter();
  const { error, pending, run } = useAction();
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/api/ingest/transaction`;
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sem permissão */ } };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Com uma chave, o iPhone (Atalhos → Automação → <b>Transação</b>, ao pagar com Apple Pay) ou o Android (Tasker) envia cada compra para o app na hora. A chave só grava na <b>sua</b> conta.</p>
      <div className="rounded-md bg-surface-2 p-3 text-sm">
        <p className="font-semibold">Endereço (POST, JSON)</p>
        <div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-xs">{url || "…/api/ingest/transaction"}</code><button onClick={() => copy(url)} aria-label="Copiar endereço" className="rounded-md bg-surface p-2"><Copy className="size-4" /></button></div>
        <p className="mt-2 text-xs text-muted">Cabeçalho <code>Authorization: Bearer SUA_CHAVE</code> · corpo: <code>{`{"amount": 86.50, "merchant": "Padaria", "card": "Nome do cartão"}`}</code></p>
      </div>
      {tokens.length > 0 && (
        <ul className="divide-y divide-border">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span><b>{t.label}</b><span className="block text-xs text-muted">criada em {t.createdAt.slice(0, 10).split("-").reverse().join("/")} · {t.lastUsedAt ? `usada em ${t.lastUsedAt.slice(0, 10).split("-").reverse().join("/")}` : "nunca usada"}</span></span>
              <button disabled={pending} className="min-h-10 px-2 font-semibold text-expense" onClick={() => { if (window.confirm(`Revogar a chave "${t.label}"? Quem usa ela deixa de funcionar.`)) run(() => removeApiToken(t.id)); }}>Revogar</button>
            </li>
          ))}
        </ul>
      )}
      <form className="flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        const r = await newApiToken(label);
        if (r.ok) { setCreated((r.data as { token: string }).token); setLabel(""); router.refresh(); }
      }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome (ex.: iPhone)" aria-label="Nome da nova chave" required maxLength={40} className={field} />
        <button className="shrink-0 rounded-md bg-accent px-4 font-bold text-on-accent">Criar chave</button>
      </form>
      {created && (
        <div role="alertdialog" aria-label="Chave criada" className="flex flex-col gap-2 rounded-md border border-accent bg-surface-2 p-3 text-sm">
          <p className="font-semibold">Copie agora — ela não será mostrada de novo:</p>
          <div className="flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-xs">{created}</code><button onClick={() => copy(created)} className="rounded-md bg-accent px-3 py-2 font-semibold text-on-accent">{copied ? "Copiado" : "Copiar"}</button></div>
          <button onClick={() => setCreated(null)} className="self-end font-semibold text-accent">Fechar</button>
        </div>
      )}
      <Msg error={error} done={false} />
    </div>
  );
}
