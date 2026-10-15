import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("dono@example.com");
  await page.getByLabel("Senha").fill("senha-e2e-segura-1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/");
}

test("funciona offline: abre sem internet, registra gasto pendente e sincroniza ao voltar", async ({ page, context }) => {
  await login(page);
  // garante service worker ativo e telas pré-carregadas no aparelho
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(async () => page.evaluate(async () => (await (await caches.open("fos-pages-v3")).keys()).length), { timeout: 30_000 }).toBeGreaterThan(8);
  const saldoAntes = await page.getByRole("region", { name: "Saldo" }).innerText();

  await context.setOffline(true);
  await page.reload(); // abre a partir do que está salvo no aparelho
  await expect(page.getByText("Sem internet.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Saldo" })).toContainText(saldoAntes.split("\n").find((l) => l.startsWith("R$")) ?? "R$");

  // registra um gasto offline
  const desc = `Offline ${Date.now()}`;
  await page.getByRole("button", { name: "GASTEI" }).click();
  await page.getByLabel("Valor", { exact: true }).fill("1234");
  await page.getByLabel("Descrição").fill(desc);
  await page.getByLabel("Categoria", { exact: true }).selectOption({ label: "Mercado" });
  await page.getByRole("button", { name: "Salvar gasto" }).click();
  await expect(page.getByText("Salvo no aparelho — pendente")).toBeVisible();
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByText(/aguardando envio/)).toBeVisible();

  // volta a internet: sincroniza sozinho, sem duplicar
  await context.setOffline(false);
  await expect(page.getByText(/aguardando envio/)).toHaveCount(0, { timeout: 30_000 });
  await page.goto("/movimentacoes?q=Offline");
  await expect(page.getByRole("button", { name: new RegExp(`^${desc}`) })).toHaveCount(1);
});
