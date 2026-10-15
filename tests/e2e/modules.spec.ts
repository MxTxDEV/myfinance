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
  await expect(page.getByText("Neste aparelho").first()).toBeVisible();
  await expect(page.getByLabel(/Tocar a caixa registradora/)).toBeChecked();
});

test("menu de notificações: organizar horários, categorias e avisos (persiste)", async ({ page }) => {
  await login(page);
  await page.goto("/notificacoes");
  await expect(page.getByText("Organizar notificações")).toBeVisible();
  await expect(page.getByText("nunca chamou o servidor")).toBeVisible(); // agendador externo ainda não configurado neste ambiente
  await page.getByLabel("Mensagens sorteadas por dia").selectOption("3");
  await page.getByLabel("A partir de").fill("08:00");
  await page.getByLabel("Até", { exact: true }).fill("20:00");
  await expect(page.getByLabel("Incentivo (não desista)")).toBeChecked();
  await expect(page.getByLabel(/Comemorar minhas conquistas/)).toBeChecked();
  await page.getByLabel("Pense antes de gastar").uncheck();
  await page.getByLabel("Incentivo (não desista)").uncheck();
  await page.getByLabel(/Usar emojis/).uncheck();
  await page.getByLabel("Faturas do cartão").uncheck();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Salvo ✓").first()).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Mensagens sorteadas por dia")).toHaveValue("3");
  await expect(page.getByLabel("A partir de")).toHaveValue("08:00");
  await expect(page.getByLabel("Pense antes de gastar")).not.toBeChecked();
  await expect(page.getByLabel("Invista em vez de gastar")).toBeChecked();
  await expect(page.getByLabel(/Usar emojis/)).not.toBeChecked();
  await expect(page.getByLabel("Faturas do cartão")).not.toBeChecked();
  // "Hoje": manhã às 08:00 + 3 sorteadas só de incentivo a investir, todas dentro da janela
  const hoje = page.locator("section", { hasText: "Hoje" }).first();
  const times = (await hoje.locator("li span.tabular-nums").allInnerTexts()).map((t) => t.replace(" ✓", ""));
  expect(times).toHaveLength(4);
  expect(times[0]).toBe("08:00");
  for (const t of times) { expect(t >= "08:00" && t <= "20:00").toBe(true); }
  await expect(hoje.getByText("Pensar antes de gastar")).toHaveCount(0);
  await expect(hoje.getByText("Incentivo")).toHaveCount(0); // só "Investir" ficou ligado
});

test("parabéns: concluir uma meta mostra a conquista no Início e dá para dispensar", async ({ page }) => {
  await login(page);
  await page.goto("/planejamento?tab=metas");
  await page.getByText("Nova meta").click();
  await page.getByLabel("Nome da meta").fill("Meta relâmpago");
  await page.getByLabel("Valor-alvo").fill("10000");
  await page.getByRole("button", { name: "Criar meta" }).click();
  await expect(page.getByRole("progressbar", { name: /Meta relâmpago/ })).toBeVisible();
  await page.getByText("Aporte ou retirada").last().click();
  await page.locator("details[open]").getByLabel("Valor", { exact: true }).fill("10000");
  await page.getByRole("button", { name: "Registrar aporte" }).click();
  await expect(page.getByRole("progressbar", { name: /Meta relâmpago: 100%/ })).toBeVisible();

  await page.goto("/");
  const win = page.getByRole("region", { name: "Conquista" }).filter({ hasText: "Meta relâmpago" });
  await expect(win).toBeVisible();
  await expect(win).toContainText(/concluiu|CONCLUÍDA|conseguiu|bateu/i);
  await win.getByRole("button", { name: "Dispensar" }).click();
  await expect(page.getByRole("region", { name: "Conquista" }).filter({ hasText: "Meta relâmpago" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Conquista" }).filter({ hasText: "Meta relâmpago" })).toHaveCount(0); // continua dispensada
});

test("barra de navegação fica fixa ao rolar a página", async ({ page }) => {
  await login(page);
  await page.goto("/notificacoes"); // página longa
  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav).toBeVisible();
  const vh = await page.evaluate(() => window.innerHeight);
  // Sem overflow-x no body (causa do bug da barra "andando" no Safari do iPhone)
  expect(await page.evaluate(() => getComputedStyle(document.body).overflowX)).toBe("visible");
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(total).toBeGreaterThan(vh * 1.5); // há mesmo o que rolar
  for (const y of [0, 400, 900, total]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
    const box = await nav.boundingBox();
    expect(Math.round(box!.y + box!.height), `scroll ${y}`).toBe(vh); // colada no fundo da tela
  }
});

test("diagnóstico: mostra por que não chega notificação e o botão de teste responde", async ({ page }) => {
  await login(page);
  await page.goto("/notificacoes");
  const card = page.locator("section", { hasText: "Por que não chegou?" }).first();
  await expect(card.getByText("Chaves de notificação no servidor")).toBeVisible();
  await expect(card.getByText(/Aparelhos ativados/)).toBeVisible();
  await expect(card.getByText("Por isso nada chega sozinho.")).toBeVisible();
  await expect(card.locator("code").filter({ hasText: "/api/cron/tick" })).toContainText("http");
  await card.getByRole("button", { name: /Rodar o envio agora/ }).click();
  await expect(card.getByRole("status")).toContainText("As chaves de notificação não estão no servidor.");
  await expect(page.getByText("Horário passou e não foi enviada").first()).toBeVisible().catch(() => {}); // depende da hora do teste
});

test("importar extrato OFX: revisar, gravar e reimportar sem duplicar", async ({ page }) => {
  await login(page);
  const ofx = `<OFX><STMTTRN><DTPOSTED>20261013<TRNAMT>-86.50<FITID>E2E1<MEMO>MERCADO TESTE IMPORT</STMTTRN>
<STMTTRN><DTPOSTED>20261005<TRNAMT>4600.00<FITID>E2E2<MEMO>SALARIO TESTE IMPORT</STMTTRN>
<STMTTRN><DTPOSTED>20261017<TRNAMT>-350.00<FITID>E2E3<MEMO>PAGAMENTO FATURA CARTAO ROXO</STMTTRN></OFX>`;
  const file = { name: "extrato.ofx", mimeType: "application/x-ofx", buffer: Buffer.from(ofx) };
  await page.goto("/perfil");
  await page.getByText("Importar extrato do banco ou fatura").click();
  await page.locator("details[open]").getByLabel("Importar para").selectOption({ label: "Banco" });
  await page.getByLabel("Arquivo do extrato").setInputFiles(file);
  await expect(page.getByText("3 de 3 selecionados").or(page.getByText("2 de 3 selecionados"))).toBeVisible();
  await expect(page.getByText(/Pagamento de fatura: registre em Perfil/)).toBeVisible();
  await expect(page.getByLabel("Importar PAGAMENTO FATURA CARTAO ROXO")).not.toBeChecked(); // não conta duas vezes
  await page.getByLabel("Categoria de MERCADO TESTE IMPORT").selectOption({ label: "Mercado" });
  await page.getByLabel("Categoria de SALARIO TESTE IMPORT").selectOption({ label: "Salário" });
  await page.getByRole("button", { name: /^Importar 2 lançamento/ }).click();
  await expect(page.getByText("2 importado(s)")).toBeVisible();

  await page.goto("/movimentacoes?q=TESTE IMPORT");
  await expect(page.getByRole("button", { name: /^MERCADO TESTE IMPORT/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^SALARIO TESTE IMPORT/ })).toHaveCount(1);

  // reimportar o mesmo arquivo: tudo vem como "já importado" e nada é duplicado
  await page.goto("/perfil");
  await page.getByText("Importar extrato do banco ou fatura").click();
  await page.locator("details[open]").getByLabel("Importar para").selectOption({ label: "Banco" });
  await page.getByLabel("Arquivo do extrato").setInputFiles(file);
  await expect(page.getByText("0 de 3 selecionados")).toBeVisible();
  await expect(page.getByText("Já importado antes.").first()).toBeVisible();
  await page.goto("/movimentacoes?q=TESTE IMPORT");
  await expect(page.getByRole("button", { name: /^MERCADO TESTE IMPORT/ })).toHaveCount(1);
});

test("vincular o lançamento a uma dívida atualiza conta e saldo devedor juntos", async ({ page }) => {
  await login(page);
  await page.goto("/planejamento?tab=dividas");
  await page.getByText("Nova dívida").click();
  await page.getByLabel("Nome da dívida").fill("Financiamento E2E");
  await page.getByLabel("Valor original").fill("100000");
  await page.getByRole("button", { name: "Cadastrar dívida" }).click();
  await expect(page.getByText("Financiamento E2E")).toBeVisible();
  await expect(page.getByText("R$ 1.000,00").first()).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "GASTEI" }).click();
  await page.getByLabel("Valor", { exact: true }).fill("30000");
  await page.getByRole("button", { name: /Mais detalhes/ }).click();
  await page.getByLabel("Vincular a").selectOption({ label: "Financiamento E2E" });
  await expect(page.getByText(/Atualiza a conta, o saldo da dívida/)).toBeVisible();
  await page.getByRole("button", { name: "Salvar gasto" }).click();
  await expect(page.getByText("Despesa registrada")).toBeVisible();
  await page.getByRole("button", { name: "Concluir" }).click();

  await page.goto("/planejamento?tab=dividas");
  await expect(page.getByText("R$ 700,00").first()).toBeVisible(); // 1.000 − 300
  await page.goto("/movimentacoes?q=Pagamento: Financiamento E2E");
  await expect(page.getByRole("button", { name: /^Pagamento: Financiamento E2E/ })).toBeVisible();
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
