import { defineConfig } from "@playwright/test";

const DB = "postgresql://fin:fin@localhost:5432/finance_os_test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 60_000,
  use: { baseURL: "http://localhost:3100", viewport: { width: 390, height: 844 }, launchOptions: { executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" } },
  globalSetup: "./tests/e2e/global-setup.ts",
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    env: { DATABASE_URL: DB, AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234567" },
  },
});
