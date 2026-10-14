// Cria (ou atualiza a senha d)o proprietário e as categorias padrão. Uso:
//   OWNER_EMAIL=... OWNER_NAME=... OWNER_PASSWORD=... npm run db:seed-owner
import { prisma } from "../src/server/db";
import { hashPassword } from "../src/server/auth";
import { ensureDefaultCategories } from "../src/server/services/categories";

async function main() {
  const { OWNER_EMAIL: email, OWNER_NAME: name, OWNER_PASSWORD: pw } = process.env;
  if (!email || !pw || pw.length < 10) throw new Error("Defina OWNER_EMAIL e OWNER_PASSWORD (mín. 10 caracteres)");
  const passwordHash = await hashPassword(pw);
  const existing = await prisma.profile.findFirst();
  if (existing) {
    await prisma.profile.update({ where: { id: existing.id }, data: { email, name: name ?? existing.name, passwordHash, sessionVersion: { increment: 1 } } });
    console.log("Proprietário atualizado (sessões antigas invalidadas).");
  } else {
    await prisma.profile.create({ data: { email, name: name ?? "Proprietário", passwordHash } });
    console.log("Proprietário criado.");
  }
  console.log(`Categorias padrão: ${await ensureDefaultCategories()} criadas.`);
}
main().finally(() => prisma.$disconnect());
