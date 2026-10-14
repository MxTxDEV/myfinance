import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("dono@example.com");
  await page.getByLabel("Senha").fill("senha-e2e-segura-1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/");
}
const saved = (page: Page) => expect(page.getByText("Salvo ✓").first()).toBeVisible();

test.describe.configure({ mode: "serial" });

test("cartão: compra não mexe no saldo, pagamento parcial e total", async ({ page }) => {
  await login(page);
  await page.goto("/perfil");
  // conta + cartão
  await page.getByText("Nova conta").click();
  await page.getByLabel("Nome da conta").fill("Banco");
  await page.getByLabel("Saldo inicial", { exact: true }).last().fill("200000");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await saved(page);
  await page.getByText("Novo cartão").click();
  await page.getByLabel("Nome do cartão").fill("Roxo");
  await page.getByLabel("Limite total").fill("500000");
  await page.getByRole("button", { name: "Criar cartão" }).click();
  await saved(page);
  await expect(page.getByText("Disponível").first()).toBeVisible();

  // compra parcelada 3x no cartão
  await page.goto("/");
  await page.getByRole("button", { name: "GASTEI" }).click();
  await page.getByLabel("Valor", { exact: true }).fill("30000");
  await page.getByLabel("Descrição").fill("Notebook");
  await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "Tecnologia" });
  await page.getByLabel("Conta ou cartão").selectOption({ label: "Roxo" });
  await page.getByRole("button", { name: /Mais detalhes/ }).click();
  await page.getByLabel("Parcelas").selectOption("3");
  await page.getByRole("button", { name: "Salvar gasto" }).click();
  await expect(page.getByText("Despesa registrada")).toBeVisible();
  await page.getByRole("button", { name: "Concluir" }).click();

  await page.goto("/perfil");
  await expect(page.getByText("R$ 2.000,00").first()).toBeVisible(); // saldo da conta intacto
  await expect(page.getByText("R$ 4.700,00").first()).toBeVisible(); // limite disponível: 5000 − 300
  await page.getByText("Pagar", { exact: true }).first().click();
  await page.locator("details[open]").getByLabel("Valor do pagamento").fill("4000");
  await page.getByRole("button", { name: "Pagar parcialmente" }).click();
  await expect(page.getByText(/pago R\$ 40,00/).first()).toBeVisible();
});

test("planejamento: orçamento, meta e dívida", async ({ page }) => {
  await login(page);
  await page.goto("/planejamento?tab=orcamentos");
  await expect(page.getByText("Nenhum orçamento definido")).toBeVisible();
  await page.getByText("Definir limite").click();
  await page.getByLabel("Categoria").selectOption({ label: "Tecnologia" });
  await page.getByLabel("Limite mensal").fill("20000");
  await page.getByRole("button", { name: "Salvar orçamento" }).click();
  await expect(page.getByText("Restam").first()).toBeVisible();

  await page.goto("/planejamento?tab=metas");
  await page.getByText("Nova meta").click();
  await page.getByLabel("Nome da meta").fill("Reserva");
  await page.getByLabel("Valor-alvo").fill("1000000");
  await page.getByRole("button", { name: "Criar meta" }).click();
  await expect(page.getByRole("progressbar", { name: /Reserva/ })).toBeVisible();
  await page.getByText("Aporte ou retirada").click();
  await page.getByLabel("Valor", { exact: true }).fill("50000");
  await page.getByRole("button", { name: "Registrar aporte" }).click();
  await expect(page.getByText("5%").first()).toBeVisible();

  await page.goto("/planejamento?tab=patrimonio");
  await expect(page.getByText("Patrimônio líquido")).toBeVisible();
  await page.goto("/planejamento?tab=relatorios");
  await expect(page.getByText("Taxa de poupança").first()).toBeVisible();
});

test("acessibilidade: sem violações sérias nas telas principais", async ({ page }) => {
  await login(page);
  for (const url of ["/", "/movimentacoes", "/perfil", "/planejamento?tab=metas", "/notificacoes"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    for (const v of bad) for (const n of v.nodes) console.log("A11Y", url, n.html.slice(0, 80), "|", (n.any[0]?.message ?? "").slice(0, 140));
    expect(bad.map((v) => `${url}: ${v.id} (${v.nodes.length})`), url).toEqual([]);
  }
});
