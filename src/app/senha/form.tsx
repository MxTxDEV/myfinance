"use client";
import { useActionState } from "react";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  const field = "w-full rounded-md bg-surface-2 px-4 py-3.5 text-base outline-none focus-visible:ring-2 ring-accent";
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-muted">Senha atual (ou temporária)
        <input name="current" type="password" autoComplete="current-password" required className={`${field} mt-1`} />
      </label>
      <label className="text-sm font-medium text-muted">Nova senha (mínimo 10 caracteres)
        <input name="next" type="password" autoComplete="new-password" required minLength={10} className={`${field} mt-1`} />
      </label>
      <label className="text-sm font-medium text-muted">Repita a nova senha
        <input name="confirm" type="password" autoComplete="new-password" required minLength={10} className={`${field} mt-1`} />
      </label>
      {state?.error && <p role="alert" className="text-sm font-medium text-expense">{state.error}</p>}
      <button disabled={pending} className="mt-2 rounded-md bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60">{pending ? "Salvando…" : "Salvar nova senha"}</button>
    </form>
  );
}
