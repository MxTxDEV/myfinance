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

test("transferência e edição/duplicação/exclusão pela interface", async ({ page }) => {
  await login(page);
  await page.goto("/perfil");
  await page.getByText("Transferir entre contas").click();
  await page.getByLabel("Valor da transferência").fill("10000");
  await page.getByLabel("Conta de origem").selectOption({ label: "De: Conta Principal" });
  await page.getByLabel("Conta de destino").selectOption({ label: "Para: Banco" });
  await page.getByRole("button", { name: "Transferir" }).click();
  await saved(page);

  await page.goto("/movimentacoes?type=TRANSFER");
  await page.getByRole("button", { name: /^Transferência/ }).click();
  await page.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Valor", { exact: true }).fill("25000");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("R$ 250,00").first()).toBeVisible();

  // duplicar e excluir uma despesa comum
  await page.goto("/movimentacoes?q=Mercado");
  await page.getByRole("button", { name: /^Mercado/ }).first().click();
  await page.getByRole("button", { name: "Duplicar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Mercado/ })).toHaveCount(2);
  await page.getByRole("button", { name: /^Mercado/ }).first().click();
  await page.getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("saldo será recalculado");
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Mercado/ })).toHaveCount(1);
});

test("investimentos: cadastrar, aportar, atualizar valor e ver rendimento", async ({ page }) => {
  await login(page);
  await page.goto("/planejamento?tab=investimentos");
  await expect(page.getByText("Nenhum investimento cadastrado")).toBeVisible();
  await page.getByText("Novo investimento").click();
  await page.getByLabel("Nome do investimento").fill("CDB Teste");
  await page.getByLabel("Valor atual").fill("100000");
  await page.getByRole("button", { name: "Cadastrar investimento" }).click();
  await expect(page.getByText("CDB Teste")).toBeVisible();
  await page.getByText("Aporte ou resgate").click();
  await page.locator("details[open]").getByLabel("Valor", { exact: true }).fill("20000");
  await page.locator("details[open]").getByLabel("Conta").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Registrar aporte" }).click();
  await expect(page.getByText("R$ 1.200,00").first()).toBeVisible();
  await page.getByText("Atualizar valor de hoje").click();
  await page.locator("details[open]").getByLabel("Valor de hoje").fill("132000");
  await page.getByRole("button", { name: "Atualizar valor" }).click();
  await expect(page.getByText("+ R$ 120,00").first()).toBeVisible(); // 1.320 − (1.000 + 200) = +120
  // o aporte aparece no extrato como movimento neutro, não como despesa
  await page.goto("/movimentacoes?type=INVESTMENT");
  await expect(page.getByRole("button", { name: /^Aporte: CDB Teste/ })).toBeVisible();
});

test("contas fixas: repetir pelo lançamento rápido, painel do mês, editar e encerrar", async ({ page }) => {
  await login(page);
  await page.goto("/");
  await page.getByRole("button", { name: "GASTEI" }).click();
  await page.getByLabel("Valor", { exact: true }).fill("10400");
  await page.getByLabel("Descrição").fill("Internet fixa");
  await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "Moradia" });
  await page.getByRole("button", { name: /Mais detalhes/ }).click();
  await page.getByLabel("Repetir").selectOption("MONTHLY");
  await page.getByRole("button", { name: "Salvar gasto" }).click();
  await expect(page.getByText("Despesa registrada")).toBeVisible();
  await page.getByRole("button", { name: "Concluir" }).click();

  await page.goto("/planejamento?tab=compromissos");
  await expect(page.getByText("Despesas fixas", { exact: true })).toBeVisible();
  await expect(page.getByText("Internet fixa").first()).toBeVisible();
  await expect(page.getByText(/Pago \d\d\/\d\d\/\d{4}/).first()).toBeVisible();
  await page.getByText("Editar valor e dados").first().click();
  await page.locator("details[open]").getByLabel("Valor", { exact: true }).fill("11900");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Salvo ✓").first()).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Encerrar" }).first().click();
  await expect(page.getByText("encerrada").first()).toBeVisible();
});

test("mensagem do dia e som de caixa registradora", async ({ page, request }) => {
  await login(page);
  const card = page.getByRole("region", { name: "Mensagem do dia" });
  await expect(card).toBeVisible();
  await expect(card.getByText("Antes de gastar hoje")).toBeVisible();
  expect((await card.locator("p").nth(1).innerText()).length).toBeGreaterThan(30);
  await expect(card.getByRole("button", { name: "Ouvir a caixa registradora" })).toBeVisible();
  const snd = await page.request.get("/sounds/caixa-registradora.wav");
  expect(snd.status()).toBe(200);
  expect(snd.headers()["content-type"]).toContain("audio");
  // sem segredo, o cron está fechado
  expect((await request.get("/api/cron/daily")).status()).toBe(401);
  await page.goto("/notificacoes");
  await expect(page.getByText("Mensagem das 06:00").first()).toBeVisible();
  await expect(page.getByLabel(/Tocar a caixa registradora/)).toBeChecked();
});

test("acessibilidade: sem violações sérias nas telas principais", async ({ page }) => {
  await login(page);
  for (const url of ["/", "/movimentacoes", "/perfil", "/planejamento?tab=metas", "/planejamento?tab=investimentos", "/planejamento?tab=compromissos", "/notificacoes"]) {
    await page.goto(url);
    await page.locator("main").waitFor();
    await page.waitForTimeout(800); // deixa as animações assentarem (a rede nunca fica ociosa: há sincronização em segundo plano)
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    for (const v of bad) for (const n of v.nodes) console.log("A11Y", url, n.html.slice(0, 80), "|", (n.any[0]?.message ?? "").slice(0, 140));
    expect(bad.map((v) => `${url}: ${v.id} (${v.nodes.length})`), url).toEqual([]);
  }
});
