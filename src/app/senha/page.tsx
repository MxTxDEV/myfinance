import { requireOwner } from "@/server/auth";
import { PasswordForm } from "./form";

export default async function SenhaPage() {
  const owner = await requireOwner({ allowMustChange: true });
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6 py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{owner.mustChangePassword ? "Crie sua senha" : "Trocar senha"}</h1>
        <p className="mt-1 text-muted">{owner.mustChangePassword ? "Você entrou com uma senha temporária. Escolha uma senha só sua para continuar." : "Ao trocar, os outros aparelhos serão desconectados."}</p>
      </div>
      <PasswordForm />
    </main>
  );
}
