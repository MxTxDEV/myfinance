import { execSync } from "node:child_process";

export default function setup() {
  // Aplica as migrações no banco de testes (isolado do banco de desenvolvimento).
  execSync("npx prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: "postgresql://fin:fin@localhost:5432/finance_os_test" },
  });
}
