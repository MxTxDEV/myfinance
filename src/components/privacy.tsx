"use client";
import { createContext, useContext, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { formatBRL } from "@/domain/money";
import { setHideValues } from "@/app/(app)/actions";

const Ctx = createContext<{ hidden: boolean; toggle: () => void }>({ hidden: false, toggle: () => {} });

export function PrivacyProvider({ initial, children }: { initial: boolean; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(initial);
  const [, start] = useTransition();
  const toggle = () => { const n = !hidden; setHidden(n); start(async () => { await setHideValues(n); }); };
  return <Ctx.Provider value={{ hidden, toggle }}>{children}</Ctx.Provider>;
}

export function Money({ cents, sign, className = "" }: { cents: number; sign?: boolean; className?: string }) {
  const { hidden } = useContext(Ctx);
  if (hidden) return <span className={`num ${className}`} aria-label="valor oculto">R$ ••••</span>;
  const v = formatBRL(Math.abs(cents));
  const prefix = sign ? (cents < 0 ? "− " : cents > 0 ? "+ " : "") : cents < 0 ? "− " : "";
  return <span className={`num ${className}`}>{prefix}{v}</span>;
}

export function HideToggle() {
  const { hidden, toggle } = useContext(Ctx);
  return (
    <button onClick={toggle} aria-pressed={hidden} aria-label={hidden ? "Mostrar valores" : "Ocultar valores"} className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2">
      {hidden ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  );
}
