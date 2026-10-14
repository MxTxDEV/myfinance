"use client";
import { formatBRL } from "@/domain/money";

/** Entrada monetária estilo banco: digita dígitos, o valor cresce da direita (centavos). */
export function MoneyInput({ cents, onChange, autoFocus, className = "", id, label = "Valor" }: {
  cents: number; onChange: (c: number) => void; autoFocus?: boolean; className?: string; id?: string; label?: string;
}) {
  return (
    <input
      id={id} aria-label={label} inputMode="numeric" autoComplete="off" autoFocus={autoFocus}
      value={formatBRL(cents)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
        onChange(digits ? Number(digits) : 0);
      }}
      className={`num w-full bg-transparent text-center text-4xl font-bold outline-none ${className}`}
    />
  );
}
