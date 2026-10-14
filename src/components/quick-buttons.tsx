"use client";
import { Minus, Plus } from "lucide-react";
import { useQuickAdd } from "./quick-add";

export function QuickButtons() {
  const add = useQuickAdd();
  const base = "flex min-h-16 flex-1 items-center justify-center gap-2 rounded-[20px] text-lg font-extrabold tracking-wide text-on-accent active:scale-[.98] transition";
  return (
    <div className="grid grid-cols-2 gap-3">
      <button onClick={() => add("INCOME")} className={`${base} bg-income`}><Plus className="size-5" aria-hidden />RECEBI</button>
      <button onClick={() => add("EXPENSE")} className={`${base} bg-expense`}><Minus className="size-5" aria-hidden />GASTEI</button>
    </div>
  );
}
