import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const login = async (page: Page) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("dono@example.com");
  await page.getByLabel("Senha").fill("senha-e2e-segura-1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
};

test("visitante em / vê a landing; o app instalado (?pwa=1) vai para o login", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cada gasto no lugar certo");
  await expect(page).toHaveTitle(/Finance OS/);
  expect(await page.locator('meta[property="og:title"]').getAttribute("content")).toContain("Finance OS");
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("index");
  const r = await request.get("/?pwa=1", { maxRedirects: 0 });
  expect(r.status()).toBe(307); expect(r.headers().location).toContain("/login");
  expect((await request.get("/api/export/all.json", { maxRedirects: 0 })).status()).toBe(401); // rotas privadas continuam protegidas
  expect((await request.get("/robots.txt")).status()).toBe(200);
  expect((await request.get("/sitemap.xml")).status()).toBe(200);
});

test("CTAs levam às rotas reais e disparam os eventos de instrumentação", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { (window as unknown as { __ev: string[] }).__ev = []; window.addEventListener("fos:analytics", (e) => (window as unknown as { __ev: string[] }).__ev.push((e as CustomEvent).detail.event)); });
  await page.getByRole("link", { name: /Ver demonstração/ }).first().click();
  await expect(page).toHaveURL(/#demo$/);
  await page.getByRole("tab", { name: "Cartões" }).click();
  await expect(page.getByRole("tab", { name: "Cartões" })).toHaveAttribute("aria-selected", "true");
  const hrefs = await page.getByRole("link", { name: /Criar (minha )?conta/ }).evaluateAll((a) => a.map((x) => x.getAttribute("href")));
  expect(hrefs.length).toBeGreaterThan(2);
  for (const h of hrefs) expect(h).toBe("/cadastro");
  await page.getByRole("link", { name: "Criar minha conta" }).first().click();
  await expect(page).toHaveURL(/\/cadastro$/);
  await page.goBack();
  const ev = await page.evaluate(() => (window as unknown as { __ev?: string[] }).__ev ?? []);
  expect(ev).toContain("demo_click");
});

test("demonstração: navegação por teclado, FAQ e planos honestos (sem preço inventado)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Início" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Cartões" })).toHaveAttribute("aria-selected", "true");
  await page.getByText("Quanto custa?").click();
  await expect(page.getByText("não tem cobrança configurada").first()).toBeVisible();
  await expect(page.getByText("Preços em definição")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/R\$\s?\d+[,.]\d{2}\s*\/\s*m[eê]s/i); // nenhum preço de plano
});

for (const vp of [{ name: "desktop", width: 1440, height: 900 }, { name: "celular", width: 390, height: 844 }]) {
  test(`landing (${vp.name}): sem rolagem horizontal, sem erros no console e sem violações sérias de acessibilidade`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto("/", { waitUntil: "networkidle" });
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 600) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(120); }
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(1500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    for (const v of bad) for (const n of v.nodes) console.log("A11Y", vp.name, v.id, n.html.slice(0, 90), "|", (n.any[0]?.message ?? "").slice(0, 120));
    expect(bad.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([]);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

test("movimento reduzido: a página aparece completa, sem elementos escondidos esperando animação", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /Segurança que você pode verificar/ })).toBeVisible();
  const hidden = await page.evaluate(() => [...document.querySelectorAll("[data-reveal]")].filter((e) => getComputedStyle(e).opacity === "0").length);
  expect(hidden).toBe(0);
  await ctx.close();
});

test("quem já está logado continua vendo o app em / (a landing não substitui o painel)", async ({ page }) => {
  await login(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Perfil" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText("Cada gasto no lugar certo");
});
