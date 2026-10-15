import { expect, test, type Page } from "@playwright/test";

const login = async (page: Page, email: string, pw: string) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(pw);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
};

test("cadastro, isolamento entre contas e painel do administrador", async ({ page, browser }) => {
  // pessoa nova cria a própria conta
  await page.goto("/cadastro");
  await page.getByLabel("Seu nome").fill("Maria Teste");
  await page.getByLabel("E-mail").fill("maria@example.com");
  await page.getByLabel("Senha (mínimo 10 caracteres)").fill("maria-senha-longa-1");
  await page.getByLabel("Repita a senha").fill("maria-senha-longa-1");
  await page.getByRole("button", { name: /criar conta/i }).click();
  await expect(page.getByText("Comece criando sua primeira conta")).toBeVisible();

  // ela não tem acesso ao painel de administração
  const r = await page.goto("/admin");
  expect(r?.status()).toBe(404);

  // cria uma conta bancária que só ela deve ver
  await page.goto("/perfil");
  await page.getByText("Nova conta").click();
  await page.getByLabel("Nome da conta").fill("Conta da Maria");
  await page.getByRole("button", { name: /salvar|criar/i }).first().click();
  await expect(page.getByText("Conta da Maria").first()).toBeVisible();

  // o administrador (outra sessão) não enxerga a conta dela e gerencia usuários
  const ctx = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 390, height: 844 } });
  const admin = await ctx.newPage();
  await login(admin, "dono@example.com", "senha-e2e-segura-1");
  await admin.goto("/perfil");
  await expect(admin.getByText("Conta da Maria")).toHaveCount(0);
  await admin.goto("/admin");
  await expect(admin.getByRole("heading", { name: "Administração" })).toBeVisible();
  await expect(admin.getByText("maria@example.com")).toBeVisible();

  // admin cria conta com senha temporária → primeiro acesso exige trocar a senha
  await admin.getByLabel("Nome do novo usuário").fill("Joao Convidado");
  await admin.getByLabel("E-mail do novo usuário").fill("joao@example.com");
  await admin.getByRole("button", { name: /senha temporária/i }).click();
  const temp = (await admin.getByRole("alertdialog").locator("code").innerText()).trim();
  expect(temp.length).toBeGreaterThanOrEqual(12);
  await ctx.close();

  const ctx2 = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 390, height: 844 } });
  const joao = await ctx2.newPage();
  await login(joao, "joao@example.com", temp);
  await expect(joao).toHaveURL(/\/senha$/);
  await joao.goto("/");
  await expect(joao).toHaveURL(/\/senha$/); // não escapa da troca obrigatória
  await joao.getByLabel(/Senha atual/).fill(temp);
  await joao.getByLabel("Nova senha (mínimo 10 caracteres)").fill("joao-nova-senha-9");
  await joao.getByLabel("Repita a nova senha").fill("joao-nova-senha-9");
  await joao.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(joao.getByText("Comece criando sua primeira conta")).toBeVisible();
  await ctx2.close();
});

test("API de lançamento automático exige chave válida", async ({ request }) => {
  const r = await request.post("/api/ingest/transaction", { data: { amount: 10, merchant: "x" } });
  expect(r.status()).toBe(401);
  const r2 = await request.post("/api/ingest/transaction", { headers: { Authorization: "Bearer fos_invalidainvalidainvalida" }, data: { amount: 10, merchant: "x" } });
  expect(r2.status()).toBe(401);
});
