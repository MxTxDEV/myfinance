import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma, prismaRaw, runAs } from "../db";
import { DomainError } from "../errors";
import { createTransaction } from "./transactions";
import { learnedCategoryFor } from "./statements";
import { parseAmount, normalizeDescription } from "@/domain/statement";
import { localParts } from "@/domain/schedule";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** Cria uma chave pessoal. O valor completo é mostrado UMA vez; só o hash fica guardado. */
export async function createApiToken(label: string) {
  const clean = z.string().trim().min(1, "Dê um nome para a chave").max(40).parse(label);
  const token = `fos_${randomBytes(24).toString("base64url")}`;
  const row = await prisma.apiToken.create({ data: { label: clean, tokenHash: hash(token) } });
  return { id: row.id, token };
}
export const listApiTokens = () => prisma.apiToken.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, label: true, createdAt: true, lastUsedAt: true } });
export async function revokeApiToken(id: string) { await prisma.apiToken.deleteMany({ where: { id } }); }

/** Resolve o dono da chave (sem contexto de usuário ainda). null se inválida. */
export async function userForToken(raw: string | null): Promise<string | null> {
  if (!raw || !/^fos_[\w-]{20,}$/.test(raw)) return null;
  const t = await prismaRaw.apiToken.findUnique({ where: { tokenHash: hash(raw) }, include: { user: { select: { active: true, mustChangePassword: true } } } });
  if (!t || !t.user.active) return null;
  await prismaRaw.apiToken.update({ where: { id: t.id }, data: { lastUsedAt: new Date() } });
  return t.userId;
}

const body = z.object({
  amount: z.union([z.number(), z.string()]),
  description: z.string().trim().min(1).max(120).optional(),
  merchant: z.string().trim().min(1).max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type: z.enum(["EXPENSE", "INCOME"]).default("EXPENSE"),
  card: z.string().trim().max(60).optional(),
  account: z.string().trim().max(60).optional(),
  category: z.string().trim().max(40).optional(),
  id: z.string().trim().min(1).max(100).optional(), // identificador do remetente (evita duplicar se o aviso disparar duas vezes)
});

function toCents(v: string | number): number {
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new DomainError("Valor inválido"); return Math.abs(Math.round(v * 100)); }
  const c = parseAmount(v); if (c === null) throw new DomainError("Valor inválido"); return Math.abs(c);
}

/**
 * Lançamento automático (Atalhos do iPhone, Tasker…). Roda no contexto do dono da chave. Idempotente:
 * o mesmo aviso (mesmo `id`, ou mesmo valor+local+minuto) nunca vira dois lançamentos.
 */
export async function ingestTransaction(userId: string, raw: unknown, now: Date = new Date()) {
  const v = body.parse(raw);
  return runAs(userId, async () => {
    const amount = toCents(v.amount);
    if (amount <= 0) throw new DomainError("O valor precisa ser maior que zero");
    const description = v.description ?? v.merchant;
    if (!description) throw new DomainError("Informe description ou merchant");
    const { day, minutes } = localParts(now);
    const date = v.date ?? day;

    // Destino: cartão/conta pelo nome; sem nome, o único cartão (despesa) ou a única conta.
    let cardId: string | undefined, accountId: string | undefined;
    const cards = await prisma.creditCard.findMany({ where: { archivedAt: null } });
    const accounts = await prisma.account.findMany({ where: { archivedAt: null } });
    const find = <T extends { name: string }>(list: T[], name: string) => list.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? list.find((x) => x.name.toLowerCase().includes(name.toLowerCase()));
    if (v.card) { cardId = find(cards, v.card)?.id; if (!cardId) throw new DomainError(`Cartão "${v.card}" não encontrado`); }
    else if (v.account) { accountId = find(accounts, v.account)?.id; if (!accountId) throw new DomainError(`Conta "${v.account}" não encontrada`); }
    else if (v.type === "EXPENSE" && cards.length === 1) cardId = cards[0].id;
    else if (accounts.length === 1) accountId = accounts[0].id;
    else throw new DomainError("Informe o cartão (card) ou a conta (account): há mais de uma opção");
    if (cardId && v.type === "INCOME") throw new DomainError("Receita não pode ir para cartão");

    // Categoria: pelo nome informado, pelo que você já lançou com essa descrição, ou "Outras…".
    const cats = await prisma.category.findMany({ where: { type: v.type, archivedAt: null } });
    const categoryId = (v.category && find(cats, v.category)?.id) || (await learnedCategoryFor(v.type, description)) || cats.find((c) => c.name === (v.type === "INCOME" ? "Outras receitas" : "Outras despesas"))?.id || cats[0]?.id;
    if (!categoryId) throw new DomainError("Nenhuma categoria disponível");

    const key = v.id ? `ingest:${v.id}` : `ingest:${date}|${amount}|${normalizeDescription(description)}|${Math.floor(minutes / 5)}`; // janela de 5 min
    const before = await prisma.transaction.findUnique({ where: { importKey: key } });
    const [tx] = await createTransaction({
      type: v.type, amount, description, date, categoryId, status: "SETTLED", installments: 1,
      ...(cardId ? { cardId } : { accountId }), importKey: key,
    });
    return { id: tx.id, duplicate: !!before };
  });
}
