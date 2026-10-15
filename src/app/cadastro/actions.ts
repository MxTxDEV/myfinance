"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { signupBlocked, signupCounted, startSession } from "@/server/auth";
import { DomainError } from "@/server/errors";
import { signup } from "@/server/services/users";

export async function register(_: { error?: string } | undefined, form: FormData) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (signupBlocked(ip)) return { error: "Muitos cadastros deste endereço. Tente novamente mais tarde." };
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "As senhas não conferem." };
  try {
    signupCounted(ip);
    const user = await signup({ name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), password });
    await startSession(user.id, user.sessionVersion);
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Dados inválidos." };
    console.error("cadastro falhou", e instanceof Error ? e.name : "erro");
    return { error: "Não foi possível criar a conta agora. Tente novamente." };
  }
  redirect("/");
}
