"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, RefreshCw } from "lucide-react";
import { field } from "./form-kit";
import { bankConnectToken, bankMap, bankRegister, bankSync, bankUnlink, bankUnmap } from "@/app/(app)/actions";

interface LinkAccount { id: string; name: string; kind: "ACCOUNT" | "CARD"; accountId: string | null; cardId: string | null; balance: number | null }
interface Link { id: string; connector: string; status: string; lastSyncAt: string | null; lastError: string | null; accounts: LinkAccount[] }
interface Opt { id: string; name: string }

const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : "ainda não");

/** Conectar banco/cartão pelo Open Finance (Pluggy): a autorização acontece no widget deles; o app nunca vê a senha do banco. */
export function BankPanel({ configured, sandbox, links, accounts, cards }: { configured: boolean; sandbox: boolean; links: Link[]; accounts: Opt[]; cards: Opt[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, ok?: (d: unknown) => string) => {
    setBusy(key); setErr(null); setMsg(null);
    try {
      const r = await fn();
      if (!r.ok) setErr(r.error ?? "Erro"); else { if (ok) setMsg(ok(r.data)); router.refresh(); }
    } catch { setErr("Não foi possível concluir. Tente novamente."); }
    setBusy(null);
  };

  async function connect() {
    setBusy("connect"); setErr(null); setMsg(null);
    try {
      const t = await bankConnectToken();
      if (!t.ok || !t.data) { setErr(t.ok ? "Resposta inesperada" : t.error); setBusy(null); return; }
      const { PluggyConnect } = await import("pluggy-connect-sdk");
      const widget = new PluggyConnect({
        connectToken: t.data.accessToken,
        includeSandbox: sandbox, // só com PLUGGY_SANDBOX=1: bancos de teste, sem dinheiro real
        onSuccess: async (data: { item: { id: string } }) => {
          const r = await bankRegister(data.item.id);
          if (!r.ok) setErr(r.error); else { setMsg("Banco conectado! Agora escolha onde cada conta/cartão entra e toque em Sincronizar."); router.refresh(); }
          setBusy(null);
        },
        onError: () => { setErr("Não foi possível conectar o banco."); setBusy(null); },
        onClose: () => setBusy(null),
      });
      await widget.init();
    } catch { setErr("Não foi possível abrir a conexão com o banco."); setBusy(null); }
  }

  if (!configured) {
    return <p className="text-sm text-muted">Disponível quando o administrador configurar a Pluggy (variáveis <code>PLUGGY_CLIENT_ID</code> e <code>PLUGGY_CLIENT_SECRET</code>). Enquanto isso, use a importação de extrato ou o lançamento automático por chave.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Autorize seu banco pelo Open Finance e as compras do cartão e os movimentos da conta entram sozinhos. A autorização é feita no ambiente seguro do banco/Pluggy; o app nunca vê sua senha e você pode desconectar quando quiser.</p>
      {links.map((l) => (
        <div key={l.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-semibold"><Landmark className="size-4" aria-hidden />{l.connector}</p>
            <p className="text-xs text-muted">Última sincronização: {when(l.lastSyncAt)}</p>
          </div>
          {l.lastError && <p role="alert" className="text-xs font-medium text-expense">{l.lastError}</p>}
          {l.accounts.map((a) => {
            const options = a.kind === "ACCOUNT" ? accounts : cards;
            const current = (a.kind === "ACCOUNT" ? a.accountId : a.cardId) ?? "";
            return (
              <label key={a.id} className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{a.kind === "CARD" ? "Cartão" : "Conta"}: {a.name}</span>
                <select aria-label={`Destino de ${a.name}`} value={current} disabled={!!busy} className={field}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") return void act(a.id, () => bankUnmap(a.id));
                    if (v === "__new") return void act(a.id, () => bankMap(a.id, { create: true }));
                    void act(a.id, () => bankMap(a.id, a.kind === "ACCOUNT" ? { accountId: v } : { cardId: v }));
                  }}>
                  <option value="">Não importar</option>
                  <option value="__new">Criar {a.kind === "CARD" ? "cartão" : "conta"} novo(a) a partir do banco</option>
                  {options.map((o) => <option key={o.id} value={o.id}>Usar: {o.name}</option>)}
                </select>
              </label>
            );
          })}
          <div className="flex gap-2">
            <button disabled={!!busy} onClick={() => act(l.id, () => bankSync(l.id), (d) => { const r = d as { imported: number; duplicates: number }; return `${r.imported} lançamento(s) novo(s); ${r.duplicates} já existiam.`; })} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent py-3 font-bold text-on-accent disabled:opacity-60">
              <RefreshCw className={`size-4 ${busy === l.id ? "animate-spin" : ""}`} aria-hidden />{busy === l.id ? "Sincronizando…" : "Sincronizar agora"}
            </button>
            <button disabled={!!busy} onClick={() => { if (window.confirm(`Desconectar ${l.connector}? Os lançamentos já importados continuam no app.`)) void act(l.id, () => bankUnlink(l.id)); }} className="rounded-md bg-surface-2 px-4 font-semibold text-expense disabled:opacity-60">Desconectar</button>
          </div>
        </div>
      ))}
      {msg && <p role="status" className="text-sm font-medium text-income">{msg}</p>}
      {err && <p role="alert" className="text-sm font-medium text-expense">{err}</p>}
      <button disabled={!!busy} onClick={connect} className="rounded-md bg-accent py-3.5 font-bold text-on-accent disabled:opacity-60">{busy === "connect" ? "Abrindo…" : links.length ? "Conectar outro banco" : "Conectar meu banco"}</button>
      <p className="text-xs text-muted">Dica: para conta já existente no app, escolha “Usar” — lançamentos iguais que você já digitou não são duplicados. Para começar do zero com o saldo do banco, escolha “Criar”.</p>
    </div>
  );
}
