import { randomBytes } from "node:crypto";
import type { Profile, Role } from "@prisma/client";
import { prismaRaw, runAs } from "../db";
import { hashPassword, verifyPassword } from "../auth";
import { DomainError } from "../errors";
import { ensureDefaultCategories } from "./categories";
import { z } from "zod";

/* ───────────── Regras de senha e e-mail ───────────── */
const COMMON = new Set(["1234567890", "0123456789", "password12", "senha12345", "qwertyuiop", "1111111111", "abcdefghij", "12345678910", "mudar12345"]);
export function checkPassword(pw: string, email = ""): string | null {
  if (pw.length < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  if (pw.length > 200) return "A senha é longa demais.";
  if (/^(.)\1+$/.test(pw)) return "Escolha uma senha menos repetitiva.";
  if (COMMON.has(pw.toLowerCase()) || (email && pw.toLowerCase() === email.toLowerCase())) return "Essa senha é fácil demais de adivinhar.";
  return null;
}
const emailSchema = z.string().trim().toLowerCase().email("E-mail inválido").max(160);
const nameSchema = z.string().trim().min(1, "Informe seu nome").max(80);

/** Senha temporária legível e forte (sem caracteres ambíguos). */
export function generateTempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(16);
  return Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
}

/* ───────────── Configuração do app ───────────── */
export async function signupOpen(): Promise<boolean> {
  const s = await prismaRaw.setting.findUnique({ where: { key: "signupOpen" } });
  return s ? s.value === true : true; // padrão: cadastro aberto
}
export const setSignupOpen = (open: boolean) =>
  prismaRaw.setting.upsert({ where: { key: "signupOpen" }, update: { value: open }, create: { key: "signupOpen", value: open } });

/* ───────────── Criar contas ───────────── */
export async function createUser(input: { name: string; email: string; password: string; role?: Role; mustChangePassword?: boolean }): Promise<Profile> {
  const name = nameSchema.parse(input.name);
  const email = emailSchema.parse(input.email);
  const weak = checkPassword(input.password, email);
  if (weak) throw new DomainError(weak);
  if (await prismaRaw.profile.findUnique({ where: { email } })) throw new DomainError("Já existe uma conta com esse e-mail.");
  const user = await prismaRaw.profile.create({
    data: { name, email, passwordHash: await hashPassword(input.password), role: input.role ?? "USER", mustChangePassword: input.mustChangePassword ?? false },
  });
  await runAs(user.id, () => ensureDefaultCategories()); // cada conta nasce com as categorias padrão
  return user;
}

/** Cadastro público (se estiver aberto). */
export async function signup(input: { name: string; email: string; password: string }) {
  if (!(await signupOpen())) throw new DomainError("Os cadastros estão fechados no momento.");
  return createUser({ ...input, role: "USER" });
}

/* ───────────── Senha ───────────── */
export async function changePassword(userId: string, current: string, next: string) {
  const u = await prismaRaw.profile.findUnique({ where: { id: userId } });
  if (!u || !(await verifyPassword(current, u.passwordHash))) throw new DomainError("A senha atual está incorreta.");
  const weak = checkPassword(next, u.email);
  if (weak) throw new DomainError(weak);
  if (await verifyPassword(next, u.passwordHash)) throw new DomainError("A nova senha precisa ser diferente da atual.");
  // sessionVersion+1 derruba as outras sessões (outros aparelhos); a atual é renovada pelo chamador.
  return prismaRaw.profile.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next), mustChangePassword: false, sessionVersion: { increment: 1 } } });
}
export async function updateName(userId: string, name: string) {
  return prismaRaw.profile.update({ where: { id: userId }, data: { name: nameSchema.parse(name) } });
}

/* ───────────── Administração (somente super admin; nunca mostra dados financeiros) ───────────── */
export async function listUsers() {
  const [users, tx] = await Promise.all([
    prismaRaw.profile.findMany({ orderBy: { createdAt: "asc" } }),
    prismaRaw.transaction.groupBy({ by: ["userId"], _count: { _all: true }, where: { deletedAt: null } }),
  ]);
  const counts = new Map(tx.map((t) => [t.userId, t._count._all]));
  return users.map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt.toISOString(), lastLoginAt: u.lastLoginAt?.toISOString() ?? null, transactions: counts.get(u.id) ?? 0,
  }));
}

async function activeAdmins() { return prismaRaw.profile.count({ where: { role: "SUPER_ADMIN", active: true } }); }

export async function adminCreateUser(input: { name: string; email: string }) {
  const temp = generateTempPassword();
  const user = await createUser({ ...input, password: temp, mustChangePassword: true });
  return { user, tempPassword: temp }; // mostrada uma única vez ao administrador
}

export async function setUserActive(adminId: string, userId: string, active: boolean) {
  if (userId === adminId && !active) throw new DomainError("Você não pode desativar a sua própria conta.");
  const u = await prismaRaw.profile.findUnique({ where: { id: userId } });
  if (!u) throw new DomainError("Usuário não encontrado.");
  if (!active && u.role === "SUPER_ADMIN" && (await activeAdmins()) <= 1) throw new DomainError("Não é possível desativar o último administrador.");
  await prismaRaw.profile.update({ where: { id: userId }, data: { active, sessionVersion: { increment: 1 } } }); // derruba as sessões
}

export async function adminResetPassword(adminId: string, userId: string) {
  const u = await prismaRaw.profile.findUnique({ where: { id: userId } });
  if (!u) throw new DomainError("Usuário não encontrado.");
  if (u.role === "SUPER_ADMIN" && u.id !== adminId) throw new DomainError("A senha de outro administrador só ele mesmo pode trocar.");
  const temp = generateTempPassword();
  await prismaRaw.profile.update({ where: { id: userId }, data: { passwordHash: await hashPassword(temp), mustChangePassword: true, sessionVersion: { increment: 1 } } });
  return { tempPassword: temp };
}

/**
 * Apaga TODOS os dados do usuário e a conta. Ordem importa por causa das chaves estrangeiras:
 * primeiro o que depende de outras coisas, por último contas/categorias.
 */
export async function deleteUserAndData(userId: string) {
  await prismaRaw.$transaction(async (tx) => {
    const w = { where: { userId } };
    await tx.bankLinkAccount.deleteMany(w); await tx.bankLink.deleteMany(w);
    await tx.transaction.deleteMany(w);
    await tx.goalEntry.deleteMany(w); await tx.goal.deleteMany(w);
    await tx.budget.deleteMany(w);
    await tx.investmentEntry.deleteMany(w); await tx.investment.deleteMany(w);
    await tx.debt.deleteMany(w); await tx.asset.deleteMany(w);
    await tx.installmentPlan.deleteMany(w); await tx.invoice.deleteMany(w);
    await tx.recurringCommitment.deleteMany(w); await tx.creditCard.deleteMany(w);
    await tx.transfer.deleteMany(w); await tx.category.deleteMany(w); await tx.account.deleteMany(w);
    await tx.notification.deleteMany(w); await tx.pushSlot.deleteMany(w); await tx.pushSubscription.deleteMany(w); await tx.apiToken.deleteMany(w);
    await tx.profile.delete({ where: { id: userId } });
  }, { timeout: 60_000 });
}

export async function adminDeleteUser(adminId: string, userId: string) {
  if (userId === adminId) throw new DomainError("Você não pode excluir a sua própria conta por aqui.");
  const u = await prismaRaw.profile.findUnique({ where: { id: userId } });
  if (!u) throw new DomainError("Usuário não encontrado.");
  if (u.role === "SUPER_ADMIN") throw new DomainError("Administradores não podem ser excluídos por aqui.");
  await deleteUserAndData(userId);
}

/** O próprio usuário apaga a conta e todos os seus dados (exige a senha). */
export async function deleteOwnAccount(userId: string, password: string) {
  const u = await prismaRaw.profile.findUnique({ where: { id: userId } });
  if (!u || !(await verifyPassword(password, u.passwordHash))) throw new DomainError("Senha incorreta.");
  if (u.role === "SUPER_ADMIN" && (await activeAdmins()) <= 1) throw new DomainError("Você é o único administrador. Crie outro antes de excluir esta conta.");
  await deleteUserAndData(userId);
}
