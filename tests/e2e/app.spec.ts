import { expect, test } from "@playwright/test";

test("rotas privadas exigem login", async ({ page, request }) => {
  await page.goto("/movimentacoes");
  await expect(page).toHaveURL(/\/login$/);
  for (const url of ["/api/export/transactions.csv", "/api/export/all.json"]) {
    const r = await request.get(url, { maxRedirects: 0 });
    expect(r.status()).toBe(401);
  }
});

test("senha errada é recusada", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("dono@example.com");
  await page.getByLabel("Senha").fill("errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
});

test("fluxo completo: conta, receita, gasto, persistência", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("dono@example.com");
  await page.getByLabel("Senha").fill("senha-e2e-segura-1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Comece criando sua primeira conta")).toBeVisible();

  // criar conta com saldo inicial R$ 1.000,00
  await page.goto("/perfil");
  await page.getByText("Nova conta").click();
  await page.getByLabel("Nome da conta").fill("Conta Principal");
  await page.getByLabel("Saldo inicial", { exact: true }).last().fill("100000");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Salvo ✓").first()).toBeVisible();
  await expect(page.getByText("R$ 1.000,00").first()).toBeVisible();

  // receita
  await page.goto("/");
  await page.getByRole("button", { name: "RECEBI" }).click();
  await page.getByLabel("Valor", { exact: true }).fill("460000");
  await page.getByLabel("Descrição").fill("Salário");
  await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "Salário" });
  await page.getByRole("button", { name: "Salvar receita" }).click();
  await expect(page.getByText("Receita registrada")).toBeVisible();
  await page.getByRole("button", { name: "Registrar outra" }).click();

  // despesa na mesma sheet
  await page.getByRole("tab", { name: "Gastei" }).click();
  await page.getByLabel("Valor", { exact: true }).fill("8650");
  await page.getByLabel("Descrição").fill("Mercado");
  await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "Mercado" });
  await page.getByRole("button", { name: "Salvar gasto" }).click();
  await expect(page.getByText("Despesa registrada")).toBeVisible();
  await page.getByRole("button", { name: "Concluir" }).click();

  // saldo = 1000 + 4600 - 86,50 = 5.513,50
  await page.reload();
  await expect(page.getByText("R$ 5.513,50").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver todas" })).toBeVisible();

  // persiste após recarregar e aparece no histórico
  await page.goto("/movimentacoes");
  const row = (n: string) => page.getByRole("button", { name: new RegExp(`^${n}`) });
  await expect(row("Mercado")).toBeVisible();
  await page.getByPlaceholder("Buscar por descrição").fill("Sal");
  await expect(row("Salário")).toBeVisible();
  await expect(row("Mercado")).toHaveCount(0, { timeout: 5000 });

  // ocultar valores
  await page.goto("/");
  await page.getByRole("button", { name: "Ocultar valores" }).click();
  await expect(page.getByText("R$ ••••").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("R$ ••••").first()).toBeVisible(); // preferência persistida

  await page.getByRole("button", { name: "Mostrar valores" }).click();
  await expect(page.getByText("R$ ••••")).toHaveCount(0);

  // sem rolagem horizontal no celular
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
