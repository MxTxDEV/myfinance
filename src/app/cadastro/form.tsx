"use client";
import Link from "next/link";
import { useActionState } from "react";
import { register } from "./actions";

export function SignupForm() {
  const [state, action, pending] = useActionState(register, undefined);
  const field = "w-full rounded-md bg-surface-2 px-4 py-3.5 text-base outline-none focus-visible:ring-2 ring-accent";
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-muted">Seu nome
        <input name="name" autoComplete="name" required maxLength={80} className={`${field} mt-1`} />
      </label>
      <label className="text-sm font-medium text-muted">E-mail
        <input name="email" type="email" autoComplete="username" required className={`${field} mt-1`} />
      </label>
      <label className="text-sm font-medium text-muted">Senha (mínimo 10 caracteres)
        <input name="password" type="password" autoComplete="new-password" required minLength={10} className={`${field} mt-1`} />
      </label>
      <label className="text-sm font-medium text-muted">Repita a senha
        <input name="confirm" type="password" autoComplete="new-password" required minLength={10} className={`${field} mt-1`} />
      </label>
      {state?.error && <p role="alert" className="text-sm font-medium text-expense">{state.error}</p>}
      <button disabled={pending} className="mt-2 rounded-md bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60">
        {pending ? "Criando…" : "Criar conta"}
      </button>
      <p className="text-center text-sm text-muted">Já tem conta? <Link href="/login" className="font-semibold text-accent">Entrar</Link></p>
    </form>
  );
}
