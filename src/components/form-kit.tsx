"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export const field = "w-full rounded-md bg-surface-2 px-4 py-3 text-base outline-none focus-visible:ring-2 ring-accent";
export type R = { ok: boolean; error?: string };

export function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<R>, after?: () => void) => start(async () => {
    setError(null); setDone(false);
    const r = await fn();
    if (!r.ok) return setError(r.error ?? "Erro");
    setDone(true); after?.(); router.refresh();
  });
  return { error, done, pending, run };
}
export const Msg = ({ error, done }: { error: string | null; done: boolean }) => (
  <>{error && <p role="alert" className="text-sm font-medium text-expense">{error}</p>}{done && <p role="status" className="text-sm font-medium text-income">Salvo ✓</p>}</>
);
export const Submit = ({ pending, children, tone = "accent" }: { pending: boolean; children: React.ReactNode; tone?: "accent" | "income" | "expense" }) => (
  <button disabled={pending} className={`rounded-md py-3.5 font-bold text-on-accent disabled:opacity-60 ${tone === "accent" ? "bg-accent" : tone === "income" ? "bg-income" : "bg-expense"}`}>{pending ? "Salvando…" : children}</button>
);
