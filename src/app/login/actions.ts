"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { loginBlocked, loginFailed, loginSucceeded, startSession, verifyPassword } from "@/server/auth";

export async function login(_: { error?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  const key = `${email}|${ip}`;
  if (loginBlocked(key)) return { error: "Muitas tentativas. Aguarde 15 minutos." };
  const p = await prisma.profile.findUnique({ where: { email } });
  // Mesma resposta e custo para e-mail inexistente e senha errada.
  const ok = p ? await verifyPassword(password, p.passwordHash) : (await verifyPassword(password, "scrypt$00$00"), false);
  if (!p || !ok) { loginFailed(key); return { error: "E-mail ou senha incorretos." }; }
  loginSucceeded(key);
  await startSession(p.id, p.sessionVersion);
  redirect("/");
}
