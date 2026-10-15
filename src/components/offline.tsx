"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw } from "lucide-react";
import { listOutbox, markOutboxError, removeFromOutbox, type OutboxItem } from "@/lib/outbox";
import { saveTransaction } from "@/app/(app)/actions";

const WARM_ROUTES = [
  "/", "/movimentacoes", "/perfil", "/notificacoes",
  ...["orcamentos", "metas", "dividas", "investimentos", "patrimonio", "compromissos", "relatorios"].map((t) => `/planejamento?tab=${t}`),
];

/** Faixa de status: sem internet, lançamentos aguardando envio e erros da sincronização. */
export function OfflineStatus() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [busy, setBusy] = useState(false);
  const flushing = useRef(false);

  const refresh = useCallback(async () => { try { setItems(await listOutbox()); } catch { /* IndexedDB indisponível */ } }, []);

  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    flushing.current = true; setBusy(true);
    let synced = 0;
    try {
      for (const it of await listOutbox()) {
        if (it.error) continue; // aguardando decisão do usuário
        try {
          const r = await saveTransaction({ ...(it.payload as Parameters<typeof saveTransaction>[0]), clientId: it.clientId });
          if (r.ok) { await removeFromOutbox(it.clientId); synced++; }
          else await markOutboxError(it.clientId, r.error);
        } catch {
          break; // ainda sem conexão com o servidor: tenta de novo depois
        }
      }
    } finally { flushing.current = false; setBusy(false); await refresh(); if (synced) router.refresh(); }
  }, [refresh, router]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refresh(); void flush();
    const on = () => { setOnline(true); void flush(); };
    const off = () => setOnline(false);
    const changed = () => { void refresh(); void flush(); };
    window.addEventListener("online", on); window.addEventListener("offline", off); window.addEventListener("outbox-changed", changed);
    const t = setInterval(() => void flush(), 30_000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); window.removeEventListener("outbox-changed", changed); clearInterval(t); };
  }, [refresh, flush]);

  // Pré-carrega as telas principais para poderem abrir sem internet (uma vez por sessão).
  useEffect(() => {
    if (!navigator.onLine || !("serviceWorker" in navigator) || sessionStorage.getItem("fos-warm")) return;
    let cancelled = false;
    (async () => {
      await navigator.serviceWorker.ready;
      for (const u of WARM_ROUTES) { if (cancelled) return; try { await fetch(u, { headers: { "X-Warm": "1" }, credentials: "same-origin" }); } catch { return; } }
      sessionStorage.setItem("fos-warm", "1"); // só marca ao terminar: se a página recarregar no meio, tenta de novo
    })();
    return () => { cancelled = true; };
  }, []);

  const pending = items.filter((i) => !i.error);
  const failed = items.filter((i) => i.error);
  if (online && items.length === 0) return null;

  return (
    <div className="mb-3 flex flex-col gap-2" role="status" aria-live="polite">
      {!online && (
        <div className="flex items-start gap-2 rounded-md bg-surface-2 p-3 text-sm">
          <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p><b>Sem internet.</b> Você vê os dados salvos neste aparelho e pode registrar RECEBI/GASTEI normalmente — eles ficam pendentes e são enviados quando a conexão voltar.</p>
        </div>
      )}
      {pending.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-accent p-3 text-sm">
          <p><b>{pending.length}</b> {pending.length === 1 ? "lançamento aguardando envio" : "lançamentos aguardando envio"}. Ainda não contam no saldo.</p>
          <button onClick={() => void flush()} disabled={!online || busy} className="flex shrink-0 items-center gap-1 rounded-md bg-accent px-3 py-2 font-semibold text-on-accent disabled:opacity-50">
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden />Enviar
          </button>
        </div>
      )}
      {failed.map((f) => (
        <div key={f.clientId} className="rounded-md bg-expense-bg p-3 text-sm" role="alert">
          <p className="font-semibold">Não foi possível enviar “{String(f.payload.description || "lançamento")}”</p>
          <p>{f.error}</p>
          <button onClick={() => void removeFromOutbox(f.clientId)} className="mt-1 font-semibold underline">Descartar</button>
        </div>
      ))}
    </div>
  );
}
