import { redirect } from "next/navigation";
import { getOwner } from "@/server/auth";
import { signupOpen } from "@/server/services/users";
import { SignupForm } from "./form";

export default async function CadastroPage() {
  if (await getOwner()) redirect("/");
  const open = await signupOpen();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6 py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Criar conta</h1>
        <p className="mt-1 text-muted">Suas finanças ficam separadas e só você vê os seus dados.</p>
      </div>
      {open ? <SignupForm /> : (
        <p role="status" className="rounded-md bg-surface-2 p-4">Os cadastros estão fechados no momento. Peça um convite ao administrador.</p>
      )}
    </main>
  );
}
