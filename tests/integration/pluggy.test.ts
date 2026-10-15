import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setTestUser, prisma, prismaRaw, runAs } from "@/server/db";
import { resetDb, seedBasics, makeUser } from "./helpers";
import { __setPluggyFetch, listLinks, mapLinkAccount, registerItem, syncItemFromWebhook, syncLink, webhookAuthorized, webhookSecret, createConnectToken } from "@/server/services/pluggy";
import { createTransaction } from "@/server/services/transactions";
import { accountBalances } from "@/server/services/accounts";

let s: Awaited<ReturnType<typeof seedBasics>>;
let userId: string;
const calls: string[] = [];
type Tx = { id: string; date: string; description: string; type: "DEBIT" | "CREDIT"; amount: number; status?: string };
let bankTx: Tx[] = [];
let cardTx: Tx[] = [];
let itemOwner = "";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const fake = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input); calls.push(`${init?.method ?? "GET"} ${url.replace("https://api.pluggy.ai", "")}`);
  if (url.endsWith("/auth")) return json({ apiKey: "k" });
  if (url.includes("/connect_token")) return json({ accessToken: "ct" });
  if (url.includes("/items/") && (init?.method ?? "GET") === "GET") return json({ id: "item-12345678", status: "UPDATED", clientUserId: itemOwner, connector: { name: "Banco Teste" } });
  if (url.includes("/items/")) return json({});
  if (url.includes("/accounts?")) return json({ results: [
    { id: "acc-bank", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Conta Corrente", balance: 1000 },
    { id: "acc-card", type: "CREDIT", subtype: "CREDIT_CARD", name: "Cartão Gold", balance: 300, creditData: { creditLimit: 5000, balanceCloseDate: "2026-10-10T00:00:00Z", balanceDueDate: "2026-10-17T00:00:00Z" } },
  ] });
  if (url.includes("/v2/transactions")) return json({ results: url.includes("acc-card") ? cardTx : bankTx, next: null });
  return json({}, 404);
}) as typeof fetch;

beforeEach(async () => {
  await resetDb(); s = await seedBasics(); userId = (await prismaRaw.profile.findFirstOrThrow()).id; calls.length = 0; itemOwner = userId;
  process.env.PLUGGY_CLIENT_ID = "id"; process.env.PLUGGY_CLIENT_SECRET = "secret";
  __setPluggyFetch(fake);
  await prisma.category.create({ data: { name: "Outras despesas", type: "EXPENSE" } });
  await prisma.category.create({ data: { name: "Outras receitas", type: "INCOME" } });
  bankTx = [
    { id: "b1", date: "2026-10-10T03:00:00Z", description: "Salário Empresa", type: "CREDIT", amount: 3000 },
    { id: "b2", date: "2026-10-11T03:00:00Z", description: "Mercado Bom", type: "DEBIT", amount: -120.5 },
    { id: "b3", date: "2026-10-12T03:00:00Z", description: "Pagamento de fatura cartão", type: "DEBIT", amount: -300 },
    { id: "b4", date: "2026-10-13T03:00:00Z", description: "Pendente", type: "DEBIT", amount: -10, status: "PENDING" },
  ];
  cardTx = [
    { id: "c1", date: "2026-10-09T03:00:00Z", description: "Uber *Trip", type: "DEBIT", amount: 25.9 },
    { id: "c2", date: "2026-10-09T03:00:00Z", description: "Pagamento recebido", type: "CREDIT", amount: -300 },
  ];
});
afterEach(() => { __setPluggyFetch(null); delete process.env.PLUGGY_CLIENT_ID; delete process.env.PLUGGY_CLIENT_SECRET; });

const NOW = new Date("2026-10-15T12:00:00Z");

describe("Pluggy", () => {
  it("só registra itens que pertencem ao usuário", async () => {
    itemOwner = "outro-usuario";
    await expect(registerItem(userId, "item-12345678")).rejects.toThrow(/não pertence/);
    expect(await prisma.bankLink.count()).toBe(0);
    await expect(registerItem(userId, "../x")).rejects.toThrow(/inválida/);
  });

  it("conecta, cria conta/cartão a partir do banco, importa sem duplicar e fecha o saldo", async () => {
    await registerItem(userId, "item-12345678");
    const [link] = await listLinks();
    expect(link.accounts).toHaveLength(2);
    const bank = link.accounts.find((a) => a.kind === "ACCOUNT")!, card = link.accounts.find((a) => a.kind === "CARD")!;
    await mapLinkAccount(bank.id, { create: true });
    await mapLinkAccount(card.id, { create: true });

    const r = await syncLink(link.id, NOW);
    expect(r.imported).toBe(3); // salário, mercado, uber
    expect(r.skipped).toBeGreaterThanOrEqual(1); // pagamento de fatura na conta (cartão está ligado)
    const again = await syncLink(link.id, NOW);
    expect(again.imported).toBe(0); // idempotente
    expect(again.duplicates).toBe(3);

    const created = (await accountBalances()).find((a) => a.name === "Conta Corrente")!;
    // Saldo do banco (R$ 1.000,00) + R$ 300,00 do pagamento de fatura, que o app só debita quando você registra o pagamento da fatura.
    expect(created.balance).toBe(130000);
    const newCard = await prisma.creditCard.findFirstOrThrow({ where: { name: "Cartão Gold" } });
    expect(Number(newCard.limit)).toBe(5000);
    expect(newCard.closingDay).toBe(10);
    expect(await prisma.transaction.count({ where: { cardId: newCard.id } })).toBe(1);
    expect((await prisma.bankLink.findFirstOrThrow()).lastSyncAt).not.toBeNull();
  });

  it("não duplica o que já foi lançado à mão e não toca no saldo de conta existente", async () => {
    await registerItem(userId, "item-12345678");
    const [link] = await listLinks();
    const bank = link.accounts.find((a) => a.kind === "ACCOUNT")!;
    await mapLinkAccount(bank.id, { accountId: s.bank.id });
    await createTransaction({ type: "EXPENSE", amount: 12050, description: "mercado (manual)", date: "2026-10-11", categoryId: s.food.id, status: "SETTLED", installments: 1, accountId: s.bank.id });
    const r = await syncLink(link.id, NOW);
    expect(r.imported).toBe(2); // salário e pagamento de fatura (sem cartão ligado); o mercado já estava lançado
    expect(r.duplicates).toBe(1);
    expect(Number((await prisma.account.findUniqueOrThrow({ where: { id: s.bank.id } })).initialBalance)).toBe(1000);
  });

  it("outro usuário não vê nem mapeia vínculos alheios", async () => {
    await registerItem(userId, "item-12345678");
    const [link] = await listLinks();
    await makeUser("b@example.com");
    expect(await listLinks()).toEqual([]);
    await expect(mapLinkAccount(link.accounts[0].id, { create: true })).rejects.toThrow();
    await expect(syncLink(link.id)).rejects.toThrow();
    __setTestUser(userId);
  });

  it("webhook: segredo obrigatório; sincroniza no contexto do dono", async () => {
    expect(webhookAuthorized(null)).toBe(false);
    expect(webhookAuthorized("errado")).toBe(false);
    expect(webhookAuthorized(webhookSecret())).toBe(true);
    await registerItem(userId, "item-12345678");
    const [link] = await listLinks();
    await mapLinkAccount(link.accounts.find((a) => a.kind === "ACCOUNT")!.id, { create: true });
    __setTestUser(null);
    expect(await syncItemFromWebhook("item-12345678", NOW)).toBe(1);
    expect(await syncItemFromWebhook("../../x", NOW)).toBe(0);
    expect(await runAs(userId, () => prisma.transaction.count())).toBe(3);
  });

  it("token de conexão amarra o usuário", async () => {
    await createConnectToken(userId, "https://app.example");
    expect(calls.some((c) => c.includes("/connect_token"))).toBe(true);
  });
});
