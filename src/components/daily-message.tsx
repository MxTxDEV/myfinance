"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Volume2 } from "lucide-react";
import { Money } from "./privacy";

const SOUND = "/sounds/caixa-registradora.wav";
const soundOn = () => { try { return localStorage.getItem("fos-sound") !== "off"; } catch { return true; } };

/** Toca a caixa registradora. Retorna false se o navegador bloqueou (precisa de um toque na tela antes). */
export async function playCashRegister(force = false): Promise<boolean> {
  if (!force && !soundOn()) return true;
  try { await new Audio(SOUND).play(); return true; } catch { return false; }
}

/** Quando uma notificação push chega (ou é tocada) com o app aberto, toca o som. */
export function PushSoundListener() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "play-sound") void playCashRegister(); };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);
  return null;
}

/** Cartão da mensagem do dia (Início). Toca o som uma vez por dia, ao abrir. */
export function DailyMessageCard({ day, text, spent, perDay }: { day: string; text: string; spent: number; perDay: number }) {
  const tried = useRef(false);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    setMuted(!soundOn());
    if (tried.current) return;
    tried.current = true;
    let last: string | null = null;
    try { last = localStorage.getItem("fos-sound-day"); } catch { /* sem storage */ }
    if (last === day) return;
    (async () => {
      if (await playCashRegister()) { try { localStorage.setItem("fos-sound-day", day); } catch { /* ok */ } return; }
      // O navegador exige um gesto antes de tocar áudio: toca no primeiro toque na tela.
      const once = () => { void playCashRegister().then((ok) => { if (ok) try { localStorage.setItem("fos-sound-day", day); } catch { /* ok */ } }); };
      window.addEventListener("pointerdown", once, { once: true });
    })();
  }, [day]);

  const replay = useCallback(() => void playCashRegister(true), []);
  return (
    <section aria-label="Mensagem do dia" className="rounded-lg border border-border border-l-4 border-l-accent bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Antes de gastar hoje</p>
        <button onClick={replay} aria-label="Ouvir a caixa registradora" className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2"><Volume2 className="size-4" /></button>
      </div>
      <p className="mt-2 text-lg font-semibold leading-snug">{text}</p>
      {spent > 0 && (
        <p className="mt-3 text-sm text-muted">Neste mês já saíram <Money cents={spent} className="font-semibold text-expense" /> — em média <Money cents={perDay} className="font-semibold text-text" /> por dia.</p>
      )}
      {muted && <p className="mt-1 text-xs text-muted">Som desligado em Notificações.</p>}
    </section>
  );
}

function b64ToU8(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Ativar/desativar a mensagem das 06:00 neste aparelho + teste + som. */
export function PushSettings({ publicKey }: { publicKey: string | null }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(true);

  useEffect(() => {
    setSound(soundOn());
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && process.env.NODE_ENV === "production";
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub); setEndpoint(sub?.endpoint ?? null);
    });
  }, []);

  async function enable() {
    setBusy(true); setMsg(null);
    try {
      if (!publicKey) return setMsg("O servidor ainda não tem as chaves de notificação (VAPID). Veja o README.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setMsg("Permissão negada. Libere as notificações deste site nas configurações do navegador.");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) });
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error("subscribe");
      setSubscribed(true); setEndpoint(sub.endpoint); setMsg("Ativado. A mensagem chega todo dia às 06:00.");
    } catch { setMsg("Não foi possível ativar agora. Tente de novo."); } finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
      if (sub) { await fetch("/api/push/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
      setSubscribed(false); setEndpoint(null);
    } finally { setBusy(false); }
  }
  async function test() {
    if (!endpoint) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/push/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint }) });
      const j = await r.json();
      setMsg(j.sent ? "Teste enviado — olhe a barra de notificações." : "O servidor não conseguiu enviar (chaves não configuradas?).");
      void playCashRegister(true);
    } finally { setBusy(false); }
  }
  function toggleSound(on: boolean) { setSound(on); try { localStorage.setItem("fos-sound", on ? "on" : "off"); } catch { /* ok */ } }

  const btn = "rounded-md px-4 py-3 font-semibold disabled:opacity-60";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Todo dia às 06:00 (horário de Brasília) chega uma mensagem para você pensar antes de gastar.</p>
      {supported === false && <p className="rounded-md bg-surface-2 p-3 text-sm">Notificações push funcionam no app publicado e instalado. No iPhone: abra o site no Safari, toque em Compartilhar → <b>Adicionar à Tela de Início</b> e abra por lá (iOS 16.4+).</p>}
      {supported && !subscribed && <button disabled={busy} onClick={enable} className={`${btn} flex items-center justify-center gap-2 bg-accent text-on-accent`}><Bell className="size-5" aria-hidden />Ativar neste aparelho</button>}
      {supported && subscribed && (
        <div className="grid grid-cols-2 gap-3">
          <button disabled={busy} onClick={test} className={`${btn} bg-surface-2`}>Enviar teste</button>
          <button disabled={busy} onClick={disable} className={`${btn} flex items-center justify-center gap-2 bg-surface-2`}><BellOff className="size-4" aria-hidden />Desativar</button>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={sound} onChange={(e) => toggleSound(e.target.checked)} />Tocar a caixa registradora ao abrir a mensagem</label>
      {msg && <p role="status" className="text-sm font-medium">{msg}</p>}
    </div>
  );
}
