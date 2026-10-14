"use client";
import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const field = "w-full rounded-md bg-surface-2 px-4 py-3.5 text-base outline-none focus-visible:ring-2 ring-accent";
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-muted">E-mail
        <input name="email" type="email" autoComplete="username" required className={`${field} mt-1`} />
      </label>
      <label className="text-sm font-medium text-muted">Senha
        <input name="password" type="password" autoComplete="current-password" required className={`${field} mt-1`} />
      </label>
      {state?.error && <p role="alert" className="text-sm font-medium text-expense">{state.error}</p>}
      <button disabled={pending} className="mt-2 rounded-md bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60">
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
