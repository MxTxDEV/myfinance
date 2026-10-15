"use client";
import { X } from "lucide-react";
import { useAction } from "./form-kit";
import { dismissCelebration } from "@/app/(app)/actions";

/** Parabéns por uma conquista, no topo do Início, até você dispensar. */
export function CelebrationCard({ items }: { items: { id: string; title: string; body: string }[] }) {
  const { pending, run } = useAction();
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      {items.map((c) => (
        <section key={c.id} aria-label="Conquista" className="pop relative rounded-lg border border-income bg-income-bg p-5">
          <button disabled={pending} onClick={() => run(() => dismissCelebration(c.id))} aria-label="Dispensar" className="absolute right-2 top-2 grid size-9 place-items-center rounded-full text-text hover:bg-surface/60"><X className="size-4" /></button>
          <p className="pr-8 text-lg font-bold text-income">{c.title}</p>
          <p className="mt-1 leading-snug">{c.body}</p>
        </section>
      ))}
    </div>
  );
}
