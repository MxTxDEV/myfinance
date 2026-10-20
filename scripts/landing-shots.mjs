// Gera as capturas da landing a partir do app REAL com dados fictícios (banco finance_os_demo).
// Uso: DATABASE_URL=.../finance_os_demo AUTH_SECRET=... npx next start -p 3300 &  node scripts/landing-shots.mjs
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3300";
const OUT = "public/landing";
mkdirSync(OUT, { recursive: true });
const shots = [
  ["inicio", "/", null],
  ["cartoes", "/planejamento?tab=cartoes", 0],
  ["dividas", "/planejamento?tab=dividas", 0],
  ["metas", "/planejamento?tab=metas", 0],
  ["orcamentos", "/planejamento?tab=orcamentos", 0],
  ["notificacoes", "/notificacoes", "Organizar notificações"],
  ["fixas", "/planejamento?tab=compromissos", 0],
  ["movimentacoes", "/movimentacoes", 0],
  ["investimentos", "/planejamento?tab=investimentos", 0],
];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark", locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.getByLabel("E-mail").fill("demo@example.com");
await page.getByLabel("Senha").fill("demo-senha-segura-1");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"));
await page.evaluate(() => { try { localStorage.setItem("fos-hide", "0"); } catch {} });
const manifest = [];
for (const [name, url, scrollTo] of shots) {
  await page.goto(`${BASE}${url}`);
  await page.locator("main").waitFor();
  if (scrollTo) { await page.getByText(scrollTo).first().evaluate((e) => e.scrollIntoView({ block: "start" })); await page.evaluate(() => window.scrollBy(0, -16)); }
  await page.waitForTimeout(1200);
  const png = await page.screenshot({ type: "png" });
  // 30px (em CSS) de "barra de status" vazia no topo: a ilha do celular do mockup não cobre o título da tela.
  const webp = await sharp(png).resize({ width: 600 }).extend({ top: 46, background: "#0b0d10" }).webp({ quality: 82 }).toBuffer();
  writeFileSync(`${OUT}/${name}.webp`, webp);
  manifest.push({ name, bytes: webp.length });
}
await browser.close();
console.log(JSON.stringify(manifest));
