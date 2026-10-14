import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Card({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-border bg-surface p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">{title}</h2>{action}</div>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 py-6 text-center">
      <p className="font-semibold">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function MonthNav({ month, base = "/" }: { month: string; base?: string }) {
  const [y, m] = month.split("-").map(Number);
  const key = (dy: number) => { const t = y * 12 + (m - 1) + dy; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
  const raw = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  const label = raw.charAt(0).toUpperCase() + raw.slice(1);
  const btn = "grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2";
  return (
    <div className="flex items-center gap-1">
      <Link href={`${base}?m=${key(-1)}`} aria-label="Mês anterior" className={btn}><ChevronLeft className="size-5" /></Link>
      <span className="min-w-32 text-center text-sm font-medium">{label}</span>
      <Link href={`${base}?m=${key(1)}`} aria-label="Próximo mês" className={btn}><ChevronRight className="size-5" /></Link>
    </div>
  );
}
