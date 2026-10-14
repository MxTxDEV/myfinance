import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false, // testes de integração compartilham um banco
    globalSetup: ["tests/global-setup.ts"],
    env: { DATABASE_URL: "postgresql://fin:fin@localhost:5432/finance_os_test", AUTH_SECRET: "test-secret-test-secret-test-secret-123456" },
  },
});
