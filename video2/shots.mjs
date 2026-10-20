// Capturas extras (telas reais, dados fictícios) para o segundo comercial: lançamento rápido e relatório por categoria.
import { chromium } from "@playwright/test";
import sharp from "sharp";
const BASE = process.env.SHOTS_BASE ?? "http://localhost:3300";
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark", locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.getByLabel("E-mail").fill("demo@example.com"); await page.getByLabel("Senha").fill("demo-senha-segura-1");
await page.getByRole("button", { name: "Entrar" }).click(); await page.waitForURL((u) => !u.pathname.startsWith("/login"));
const save = async (name) => { const png = await page.screenshot({ type: "png" }); await sharp(png).resize({ width: 600 }).extend({ top: 46, background: "#0b0d10" }).webp({ quality: 84 }).toFile(`video2/assets/${name}.webp`); };
// lançamento rápido: abre o GASTEI e digita um valor
await page.goto(`${BASE}/`); await page.locator("main").waitFor();
await page.getByRole("button", { name: "GASTEI" }).click();
await page.getByLabel("Valor", { exact: true }).fill("3290");
await page.waitForTimeout(900); await save("gastei");
// relatório por categoria
await page.goto(`${BASE}/planejamento?tab=relatorios`); await page.locator("main").waitFor(); await page.waitForTimeout(1500);
await page.getByText("Gastos por categoria").first().evaluate((e) => e.scrollIntoView({ block: "start" })); await page.evaluate(() => window.scrollBy(0, -24)); await page.waitForTimeout(1200); await save("relatorio");
await browser.close(); console.log("ok");
