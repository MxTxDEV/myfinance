"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { assertAdmin } from "@/server/auth";
import { DomainError } from "@/server/errors";
import * as users from "@/server/services/users";

type R<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guard<T>(fn: (adminId: string) => Promise<T>): Promise<R<T>> {
  try {
    const admin = await assertAdmin();
    const data = await fn(admin.id);
    revalidatePath("/admin");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos" };
    console.error("admin action error", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "Não foi possível concluir. Tente novamente." };
  }
}

export async function adminAddUser(name: string, email: string) {
  return guard(async () => { const r = await users.adminCreateUser({ name, email }); return { email: r.user.email, tempPassword: r.tempPassword }; });
}
export async function adminSetActive(userId: string, active: boolean) { return guard((a) => users.setUserActive(a, userId, active)); }
export async function adminResetPassword(userId: string) { return guard((a) => users.adminResetPassword(a, userId)); }
export async function adminRemoveUser(userId: string) { return guard((a) => users.adminDeleteUser(a, userId)); }
export async function adminSetSignup(open: boolean) { return guard(async () => { await users.setSignupOpen(open); }); }
