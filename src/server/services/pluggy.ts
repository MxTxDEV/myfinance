import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma, prismaRaw, runAs } from "../db";
import { DomainError } from "../errors";
import { createTransaction } from "./transactions";
import { learnedCategoryFor } from "./statements";
import { looksLikeInvoicePayment } from "@/domain/statement";
import { todayBR } from "@/domain/dates";

/**
 * Open Finance via Pluggy (agregador autorizado). O app NUNCA vê a senha do banco: o usuário autoriza no widget da Pluggy
 * e aqui só recebemos o `itemId`. Credenciais da Pluggy ficam apenas em variáveis de ambiente do servidor.
 */
const BASE = "https://api.pluggy.ai";
type Fetch = typeof fetch;
let fetchImpl: Fetch | null = null;
/** Somente testes: troca o `fetch` (não há acesso à API real no ambiente de testes). */
export const __setPluggyFetch = (f: Fetch | null) => { fetchImpl = f; apiKey = null; };

export const pluggyConfigured = () => !!(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);

let apiKey: { key: string; until: number } | null = null;
async function key(): Promise<string> {
  if (apiKey && apiKey.until > Date.now()) return apiKey.key;
  if (!pluggyConfigured()) throw new DomainError("A conexão com bancos ainda não foi configurada pelo administrador.");
  const r = await (fetchImpl ?? fetch)(`${BASE}/auth`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }) });
  if (!r.ok) throw new DomainError("Não foi possível autenticar na Pluggy. Confira as credenciais do servidor.");
  const j = (await r.json()) as { apiKey?: string };
  if (!j.apiKey) throw new DomainError("Resposta inesperada da Pluggy.");
  apiKey = { key: j.apiKey, until: Date.now() + 60 * 60_000 }; // a chave vale 2 h; renovamos antes
  return j.apiKey;
}
async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await (fetchImpl ?? fetch)(`${BASE}${path}`, { method: init.method ?? "GET", headers: { "X-API-KEY": await key(), "content-type": "application/json" }, body: init.body ? JSON.stringify(init.body) : undefined });
  if (r.status === 401) apiKey = null;
  if (!r.ok) throw new DomainError(`A Pluggy recusou a consulta (${r.status}). Tente novamente em instantes.`);
  return (await r.json()) as T;
}

/* ───────────── Webhook ───────────── */
export function webhookSecret(): string {
  return process.env.PLUGGY_WEBHOOK_SECRET || createHmac("sha256", process.env.AUTH_SECRET ?? "dev").update("pluggy-webhook").digest("hex").slice(0, 32);
}
export function webhookAuthorized(given: string | null): boolean {
  if (!given) return false;
  const a = Buffer.from(given), b = Buffer.from(webhookSecret());
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ───────────── Conectar ───────────── */
/** Token de curta duração para abrir o widget. `clientUserId` amarra o item a ESTE usuário (conferido ao registrar). */
export async function createConnectToken(userId: string, origin: string | null) {
  const base = process.env.APP_URL ?? origin;
  const webhookUrl = base?.startsWith("https://") ? `${base.replace(/\/$/, "")}/api/webhooks/pluggy?s=${webhookSecret()}` : undefined;
  const r = await api<{ accessToken: string }>("/connect_token", { method: "POST", body: { options: { clientUserId: userId, ...(webhookUrl ? { webhookUrl } : {}) } } });
  return { accessToken: r.accessToken };
}

interface PItem { id: string; status?: string; clientUserId?: string | null; connector?: { name?: string } }
interface PAccount { id: string; type: "BANK" | "CREDIT"; subtype?: string; name: string; marketingName?: string | null; balance?: number | null; creditData?: { creditLimit?: number | null; balanceCloseDate?: string | null; balanceDueDate?: string | null } | null }

const day = (iso?: string | null) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : Math.min(28, d.getUTCDate()); };
const dec = (n: number | null | undefined) => (n === null || n === undefined ? null : n.toFixed(2));

/** Registra o item devolvido pelo widget (só se pertencer a este usuário) e lê suas contas/cartões. */
export async function registerItem(userId: string, itemId: string) {
  if (!/^[\w-]{8,64}$/.test(itemId)) throw new DomainError("Conexão inválida.");
  const item = await api<PItem>(`/items/${itemId}`);
  if (item.clientUserId !== userId) throw new DomainError("Essa conexão não pertence à sua conta.");
  const link = await prisma.bankLink.upsert({
    where: { userId_itemId: { userId, itemId } } as never,
    create: { itemId, connector: item.connector?.name ?? "Banco", status: item.status ?? "UPDATED" },
    update: { connector: item.connector?.name ?? "Banco", status: item.status ?? "UPDATED" },
  });
  await refreshAccounts(link.id, itemId);
  return link.id;
}

async function refreshAccounts(linkId: string, itemId: string) {
  const res = await api<{ results: PAccount[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
  for (const a of res.results ?? []) {
    const kind = a.type === "CREDIT" ? "CARD" : "ACCOUNT";
    const data = { name: (a.marketingName || a.name || "Conta").slice(0, 60), kind, subtype: a.subtype ?? null, balance: dec(a.balance), creditLimit: dec(a.creditData?.creditLimit), closingDay: day(a.creditData?.balanceCloseDate), dueDay: day(a.creditData?.balanceDueDate) };
    await prisma.bankLinkAccount.upsert({ where: { userId_pluggyAccountId: { userId: await uid(), pluggyAccountId: a.id } } as never, create: { linkId, pluggyAccountId: a.id, ...data }, update: data });
  }
}
const uid = async () => (await import("../db")).resolveUserId();

export async function listLinks() {
  const links = await prisma.bankLink.findMany({ orderBy: { createdAt: "asc" }, include: { accounts: { orderBy: { createdAt: "asc" } } } });
  return links.map((l) => ({
    id: l.id, connector: l.connector, status: l.status, lastSyncAt: l.lastSyncAt?.toISOString() ?? null, lastError: l.lastError,
    accounts: l.accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind as "ACCOUNT" | "CARD", accountId: a.accountId, cardId: a.cardId, balance: a.balance ? Number(a.balance) : null })),
  }));
}

/** Liga a conta/cartão do banco a uma conta/cartão do app, ou cria um novo. */
export async function mapLinkAccount(id: string, target: { accountId?: string; cardId?: string; create?: boolean }) {
  const la = await prisma.bankLinkAccount.findUnique({ where: { id }, include: { link: true } });
  if (!la) throw new DomainError("Conta do banco não encontrada.");
  if (target.create) {
    if (la.kind === "ACCOUNT") {
      const acc = await prisma.account.create({ data: { name: la.name, institution: la.link.connector, type: la.subtype === "SAVINGS_ACCOUNT" ? "SAVINGS" : "CHECKING", initialBalance: "0", initialBalanceDate: new Date(`${todayBR().toISOString().slice(0, 10)}T00:00:00Z`) } });
      await prisma.bankLinkAccount.update({ where: { id }, data: { accountId: acc.id, cardId: null, createdByLink: true, synced: false } });
    } else {
      const pay = (await prisma.account.findFirst({ where: { archivedAt: null, id: { in: (await prisma.bankLinkAccount.findMany({ where: { linkId: la.linkId, accountId: { not: null } } })).map((x) => x.accountId!) } } }))
        ?? (await prisma.account.findFirst({ where: { archivedAt: null }, orderBy: { createdAt: "asc" } }));
      if (!pay) throw new DomainError("Vincule ou crie primeiro a conta corrente (o cartão precisa de uma conta para pagar a fatura).");
      const card = await prisma.creditCard.create({ data: { name: la.name, issuer: la.link.connector, limit: la.creditLimit ?? "0.00", closingDay: la.closingDay ?? 1, dueDay: la.dueDay ?? 10, payAccountId: pay.id } });
      await prisma.bankLinkAccount.update({ where: { id }, data: { cardId: card.id, accountId: null, createdByLink: true, synced: false } });
    }
    return;
  }
  if (la.kind === "ACCOUNT") {
    if (!target.accountId || !(await prisma.account.findFirst({ where: { id: target.accountId, archivedAt: null } }))) throw new DomainError("Escolha uma conta válida.");
    await prisma.bankLinkAccount.update({ where: { id }, data: { accountId: target.accountId, cardId: null, createdByLink: false } });
  } else {
    if (!target.cardId || !(await prisma.creditCard.findFirst({ where: { id: target.cardId, archivedAt: null } }))) throw new DomainError("Escolha um cartão válido.");
    await prisma.bankLinkAccount.update({ where: { id }, data: { cardId: target.cardId, accountId: null, createdByLink: false } });
  }
}

export async function unmapLinkAccount(id: string) {
  await prisma.bankLinkAccount.updateMany({ where: { id }, data: { accountId: null, cardId: null, synced: false } });
}

/** Desconecta: apaga o item na Pluggy (revoga o acesso) e o vínculo aqui. Lançamentos já importados permanecem. */
export async function unlinkBank(linkId: string) {
  const l = await prisma.bankLink.findUnique({ where: { id: linkId } });
  if (!l) return;
  try { await api(`/items/${l.itemId}`, { method: "DELETE" }); } catch { /* o vínculo local é removido mesmo assim */ }
  await prisma.bankLinkAccount.deleteMany({ where: { linkId } });
  await prisma.bankLink.deleteMany({ where: { id: linkId } });
}

/* ───────────── Sincronizar ───────────── */
interface PTx { id: string; date: string; description?: string; descriptionRaw?: string | null; type: "DEBIT" | "CREDIT"; amount: number; status?: "PENDING" | "POSTED"; creditCardMetadata?: { installmentNumber?: number; totalInstallments?: number } | null }

async function fetchTransactions(accountId: string, dateFrom: string): Promise<PTx[]> {
  const out: PTx[] = [];
  let after: string | null = null;
  for (let page = 0; page < 40; page++) {
    const q = `/v2/transactions?accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    const r: { results?: PTx[]; next?: string | null } = await api(q);
    out.push(...(r.results ?? []));
    if (!r.next) break;
    after = new URL(r.next, BASE).searchParams.get("after");
    if (!after) break;
  }
  return out;
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const cleanDesc = (t: PTx) => (t.description || t.descriptionRaw || "Lançamento").replace(/\s+/g, " ").trim().slice(0, 100);

export interface SyncResult { imported: number; duplicates: number; skipped: number; failed: number }

/** Importa lançamentos novos (idempotente por id da Pluggy). Deve rodar no contexto do usuário. */
export async function syncLink(linkId: string, now: Date = new Date()): Promise<SyncResult> {
  const link = await prisma.bankLink.findUnique({ where: { id: linkId }, include: { accounts: true } });
  if (!link) throw new DomainError("Conexão não encontrada.");
  const res: SyncResult = { imported: 0, duplicates: 0, skipped: 0, failed: 0 };
  try {
    await refreshAccounts(link.id, link.itemId);
    const hasCard = link.accounts.some((a) => a.kind === "CARD" && (a.cardId));
    const accs = await prisma.bankLinkAccount.findMany({ where: { linkId, OR: [{ accountId: { not: null } }, { cardId: { not: null } }] } });
    for (const la of accs) {
      const first = !la.synced;
      const from = first ? iso(new Date(now.getTime() - 30 * DAY)) : iso(new Date((link.lastSyncAt ?? now).getTime() - 7 * DAY)); // janela de 7 dias cobre lançamentos que "viram" postados depois
      const txs = (await fetchTransactions(la.pluggyAccountId, from)).filter((t) => t.status !== "PENDING");

      if (first && la.createdByLink && la.accountId && la.balance !== null) {
        // Conta criada pela conexão: saldo inicial = saldo do banco − movimentos importados, para o saldo do app bater com o do banco.
        const net = txs.reduce((s, t) => s + (t.type === "CREDIT" ? 1 : -1) * Math.abs(t.amount), 0);
        await prisma.account.update({ where: { id: la.accountId }, data: { initialBalance: (Number(la.balance) - net).toFixed(2), initialBalanceDate: new Date(`${from}T00:00:00Z`) } });
      }
      for (const t of txs) {
        try {
          const r = await importOne(la, t, hasCard);
          if (r === "ok") res.imported++; else if (r === "dup") res.duplicates++; else res.skipped++;
        } catch (e) { res.failed++; console.error("importação Pluggy falhou", e instanceof Error ? e.name : "erro"); }
      }
      await prisma.bankLinkAccount.update({ where: { id: la.id }, data: { synced: true } });
    }
    await prisma.bankLink.update({ where: { id: linkId }, data: { lastSyncAt: now, lastError: null, status: "UPDATED" } });
  } catch (e) {
    await prisma.bankLink.update({ where: { id: linkId }, data: { lastError: e instanceof DomainError ? e.message : "Falha ao sincronizar" } });
    throw e;
  }
  return res;
}

type LA = { id: string; kind: string; accountId: string | null; cardId: string | null };
async function importOne(la: LA, t: PTx, hasCard: boolean): Promise<"ok" | "dup" | "skip"> {
  const cents = Math.round(Math.abs(t.amount) * 100);
  if (!cents || !t.date) return "skip";
  const date = t.date.slice(0, 10);
  const isCard = la.kind === "CARD";
  const type = isCard ? "EXPENSE" : t.type === "CREDIT" ? "INCOME" : "EXPENSE";
  let description = cleanDesc(t);
  if (isCard && t.type === "CREDIT") return "skip"; // pagamento de fatura/estorno no cartão: a fatura é paga pela conta
  if (!isCard && type === "EXPENSE" && hasCard && looksLikeInvoicePayment(description)) return "skip"; // já contado nas compras do cartão
  const m = t.creditCardMetadata;
  if (isCard && m?.totalInstallments && m.totalInstallments > 1 && !/\d+\/\d+/.test(description)) description = `${description} (${m.installmentNumber ?? "?"}/${m.totalInstallments})`.slice(0, 120);

  const importKey = `pluggy:${t.id}`;
  if (await prisma.transaction.findUnique({ where: { importKey } })) return "dup";
  // Já lançado por outro meio (à mão, atalho)? mesmo valor no mesmo destino em ±1 dia → não duplica.
  const d0 = new Date(`${date}T00:00:00Z`);
  const near = await prisma.transaction.findFirst({
    where: { deletedAt: null, type, amount: (cents / 100).toFixed(2), date: { gte: new Date(d0.getTime() - DAY), lte: new Date(d0.getTime() + DAY) }, ...(la.cardId ? { cardId: la.cardId } : { accountId: la.accountId! }), OR: [{ importKey: null }, { NOT: { importKey: { startsWith: "pluggy:" } } }] },
  });
  if (near) return "dup";

  const cats = await prisma.category.findMany({ where: { type, archivedAt: null } });
  const categoryId = (await learnedCategoryFor(type, description)) ?? cats.find((c) => c.name === (type === "INCOME" ? "Outras receitas" : "Outras despesas"))?.id ?? cats[0]?.id;
  if (!categoryId) throw new DomainError("Nenhuma categoria disponível");
  await createTransaction({ type, amount: cents, description, date, categoryId, status: "SETTLED", installments: 1, importKey, ...(la.cardId ? { cardId: la.cardId } : { accountId: la.accountId! }) });
  return "ok";
}

/** Sincroniza todas as conexões do usuário atual. */
export async function syncAll(now: Date = new Date()) {
  const links = await prisma.bankLink.findMany();
  const total: SyncResult = { imported: 0, duplicates: 0, skipped: 0, failed: 0 };
  for (const l of links) {
    try { const r = await syncLink(l.id, now); total.imported += r.imported; total.duplicates += r.duplicates; total.skipped += r.skipped; total.failed += r.failed; }
    catch { total.failed++; }
  }
  return total;
}

/** Webhook: sincroniza a(s) conexão(ões) desse item (qualquer usuário) — o conteúdo do aviso nunca é confiado, só o itemId. */
export async function syncItemFromWebhook(itemId: string, now: Date = new Date()) {
  if (!/^[\w-]{8,64}$/.test(itemId)) return 0;
  const links = await prismaRaw.bankLink.findMany({ where: { itemId }, select: { id: true, userId: true } });
  for (const l of links) {
    try { await runAs(l.userId, () => syncLink(l.id, now)); } catch { /* erro já registrado em lastError */ }
  }
  return links.length;
}
