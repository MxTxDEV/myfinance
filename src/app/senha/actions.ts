"use server";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { assertOwner, startSession } from "@/server/auth";
import { DomainError } from "@/server/errors";
import { changePassword } from "@/server/services/users";

/** Troca de senha (obrigatória no primeiro acesso com senha temporária; também usada em Perfil). */
export async function changePasswordAction(_: { error?: string } | undefined, form: FormData) {
  try {
    const owner = await assertOwner({ allowMustChange: true });
    const next = String(form.get("next") ?? "");
    if (next !== String(form.get("confirm") ?? "")) return { error: "As senhas novas não conferem." };
    const updated = await changePassword(owner.id, String(form.get("current") ?? ""), next);
    await startSession(updated.id, updated.sessionVersion); // renova a sessão deste aparelho; as demais caem
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Dados inválidos." };
    return { error: "Não foi possível trocar a senha agora." };
  }
  redirect("/");
}
