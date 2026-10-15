import { execFileSync, execSync } from "node:child_process";

export default function setup() {
  const env = {
    ...process.env, DATABASE_URL: "postgresql://fin:fin@localhost:5432/finance_os_test", AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234567",
    OWNER_EMAIL: "dono@example.com", OWNER_NAME: "Dono Teste", OWNER_PASSWORD: "senha-e2e-segura-1",
  };
  execSync("npx prisma migrate deploy", { env, stdio: "ignore" });
  // Zera TODAS as tabelas (exceto o histórico de migrações), para o teste começar sempre do zero.
  const truncateAll = `DO $$ DECLARE r record; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' LOOP EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" RESTART IDENTITY CASCADE'; END LOOP; END $$;`;
  execFileSync("psql", [env.DATABASE_URL, "-c", truncateAll], { stdio: "ignore" }); // sem shell: "$$" não é expandido
  execSync("npx tsx scripts/seed-owner.ts", { env, stdio: "ignore" });
}
