import { redirect } from "next/navigation";
import { getOwner } from "@/server/auth";
import { LoginForm } from "./form";

export default async function LoginPage() {
  if (await getOwner()) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Finance OS</h1>
        <p className="mt-1 text-muted">Entre para ver suas finanças.</p>
      </div>
      <LoginForm />
    </main>
  );
}
