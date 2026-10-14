"use client";
import { useAction } from "@/components/form-kit";
import { readAllNotifications } from "../actions";

export function MarkRead() {
  const { pending, run } = useAction();
  return <button disabled={pending} onClick={() => run(readAllNotifications)} className="px-2 py-2 text-sm font-semibold text-accent">Marcar como lidas</button>;
}
