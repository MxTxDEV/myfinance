"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Home, List, Plus, Target, User } from "lucide-react";
import { useQuickAdd } from "./quick-add";

const ITEMS = [
  { href: "/", label: "Início", icon: Home },
  { href: "/movimentacoes", label: "Movimentações", icon: List },
  { href: "/planejamento", label: "Planejamento", icon: Target },
  { href: "/perfil", label: "Perfil", icon: User },
] as const;

function active(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function BottomNav() {
  const path = usePathname();
  const add = useQuickAdd();
  const left = ITEMS.slice(0, 2), right = ITEMS.slice(2);
  const item = (it: (typeof ITEMS)[number]) => {
    const on = active(path, it.href);
    return (
      <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined}
        className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${on ? "text-accent" : "text-muted"}`}>
        <it.icon className="size-6" aria-hidden />
        <span className="max-w-full truncate">{it.label}</span>
      </Link>
    );
  };
  return (
    <nav aria-label="Principal" className="bottom-nav fixed inset-x-0 bottom-0 z-40 flex items-center border-t border-border bg-surface px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 md:hidden">
      {left.map(item)}
      <button onClick={() => add()} aria-label="Adicionar movimentação" className="mx-1 -mt-5 grid size-14 shrink-0 place-items-center rounded-full bg-accent text-on-accent shadow-md">
        <Plus className="size-7" />
      </button>
      {right.map(item)}
    </nav>
  );
}

export function Sidebar({ name }: { name: string }) {
  const path = usePathname();
  const add = useQuickAdd();
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-1 border-r border-border bg-surface p-5 md:flex">
      <div className="mb-6 flex items-center gap-2 text-xl font-bold"><BarChart3 className="size-6 text-accent" aria-hidden />Finance OS</div>
      <nav aria-label="Principal" className="flex flex-col gap-1">
        {ITEMS.map((it) => (
          <Link key={it.href} href={it.href} aria-current={active(path, it.href) ? "page" : undefined}
            className={`flex items-center gap-3 rounded-md px-3.5 py-3 font-medium ${active(path, it.href) ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2"}`}>
            <it.icon className="size-5" aria-hidden />{it.label}
          </Link>
        ))}
      </nav>
      <button onClick={() => add()} className="mt-3 flex items-center justify-center gap-2 rounded-md bg-accent py-3 font-bold text-on-accent"><Plus className="size-5" aria-hidden />Adicionar</button>
      <p className="mt-auto truncate text-sm text-muted">{name}</p>
    </aside>
  );
}
