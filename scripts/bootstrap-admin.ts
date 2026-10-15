// Garante o super administrador. Roda a cada deploy (idempotente). Variáveis:
//   SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD (mín. 10; vira senha TEMPORÁRIA: a troca é exigida no 1º acesso)
//   SUPERADMIN_NAME (opcional), SUPERADMIN_FORCE_RESET=1 (redefine a senha de um admin já existente)
//   SUPERADMIN_MUST_CHANGE=0 (só para testes automatizados)
// Se já existe um administrador, nada é alterado (a senha que você escolheu no app nunca é sobrescrita).
// Se só existe a conta antiga (modo aberto/legado), ela é promovida: seus dados passam a ser do administrador.
import { prismaRaw, runAs } from "../src/server/db";
import { hashPassword } from "../src/server/auth";
import { ensureDefaultCategories } from "../src/server/services/categories";

async function main() {
  const { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD: pw, SUPERADMIN_NAME, SUPERADMIN_FORCE_RESET, SUPERADMIN_MUST_CHANGE } = process.env;
  const email = SUPERADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !pw) { console.log("bootstrap-admin: SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD não definidos — nada a fazer."); return; }
  if (pw.length < 10) throw new Error("SUPERADMIN_PASSWORD precisa ter ao menos 10 caracteres");
  const mustChangePassword = SUPERADMIN_MUST_CHANGE !== "0";
  const force = SUPERADMIN_FORCE_RESET === "1";

  const admin = await prismaRaw.profile.findFirst({ where: { role: "SUPER_ADMIN" }, orderBy: { createdAt: "asc" } });
  if (admin) {
    if (!force) { console.log("bootstrap-admin: já existe administrador — mantido."); return; }
    await prismaRaw.profile.update({ where: { id: admin.id }, data: { email, passwordHash: await hashPassword(pw), mustChangePassword, active: true, sessionVersion: { increment: 1 } } });
    console.log("bootstrap-admin: administrador redefinido (sessões antigas invalidadas).");
    return;
  }

  const passwordHash = await hashPassword(pw);
  const sameEmail = await prismaRaw.profile.findUnique({ where: { email } });
  const legacy = sameEmail ?? (await prismaRaw.profile.findFirst({ orderBy: { createdAt: "asc" } }));
  let id: string;
  if (legacy) {
    // Conta preexistente (modo aberto ou legado): promove, preservando todos os dados.
    id = legacy.id;
    await prismaRaw.profile.update({ where: { id }, data: { email, name: SUPERADMIN_NAME ?? (legacy.name === "Conta principal" || !legacy.name ? "Administrador" : legacy.name), passwordHash, role: "SUPER_ADMIN", active: true, mustChangePassword, sessionVersion: { increment: 1 } } });
    console.log("bootstrap-admin: conta existente promovida a administrador (dados preservados).");
  } else {
    id = (await prismaRaw.profile.create({ data: { email, name: SUPERADMIN_NAME ?? "Administrador", passwordHash, role: "SUPER_ADMIN", mustChangePassword } })).id;
    console.log("bootstrap-admin: administrador criado.");
  }
  const n = await runAs(id, () => ensureDefaultCategories());
  console.log(`bootstrap-admin: categorias padrão criadas: ${n}.`);
}
main().finally(() => prismaRaw.$disconnect());
