import { execSync } from "node:child_process";

export default function setup() {
  const env = {
    ...process.env, DATABASE_URL: "postgresql://fin:fin@localhost:5432/finance_os_test", AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234567",
    OWNER_EMAIL: "dono@example.com", OWNER_NAME: "Dono Teste", OWNER_PASSWORD: "senha-e2e-segura-1",
  };
  execSync("npx prisma migrate deploy", { env, stdio: "ignore" });
  execSync(`psql "${env.DATABASE_URL}" -c "TRUNCATE \\"Transaction\\",\\"Transfer\\",\\"Invoice\\",\\"InstallmentPlan\\",\\"CreditCard\\",\\"Account\\",\\"Category\\",\\"Profile\\" RESTART IDENTITY CASCADE"`, { stdio: "ignore" });
  execSync("npx tsx scripts/seed-owner.ts", { env, stdio: "ignore" });
}
