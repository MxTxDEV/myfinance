import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";

/**
 * Isolamento entre usuários.
 *
 * - `prismaRaw`: cliente SEM escopo. Só para autenticação, administração, agendador e scripts.
 * - `prisma`: cliente COM escopo. Toda leitura/escrita nos modelos com `userId` é filtrada/marcada pelo usuário
 *   do contexto (AsyncLocalStorage). Sem usuário no contexto, a operação FALHA (nunca devolve dados de todos).
 * O contexto é definido por `enterUser` (ao validar a sessão) ou `runAs` (agendador, testes).
 */
const g = globalThis as unknown as { prismaRaw?: PrismaClient };
export const prismaRaw = g.prismaRaw ?? new PrismaClient({ log: ["error"] });
if (process.env.NODE_ENV !== "production") g.prismaRaw = prismaRaw;

const als = new AsyncLocalStorage<{ userId: string }>();
let testUserId: string | null = null;

export const enterUser = (userId: string) => als.enterWith({ userId });
/** Executa `fn` como o usuário. O `await` interno garante que consultas Prisma (promessas preguiçosas) rodem DENTRO do contexto. */
export const runAs = <T>(userId: string, fn: () => T | PromiseLike<T>): Promise<T> => als.run({ userId }, async () => await fn());
/** Somente testes (Vitest): define o usuário padrão do contexto. Recusado fora de testes. */
export function __setTestUser(userId: string | null) {
  if (!process.env.VITEST) throw new Error("__setTestUser só pode ser usado em testes");
  testUserId = userId;
}
/**
 * Contexto de usuário sem ALS (um `enterWith` dentro de uma função async NÃO chega ao chamador após o `await`).
 * Em requisições, o auth registra um resolvedor que lê o cookie de sessão ASSINADO (e confere no banco, com cache curto).
 */
let requestResolver: (() => Promise<string | null>) | null = null;
export const setRequestUserResolver = (fn: () => Promise<string | null>) => { requestResolver = fn; };

export async function resolveUserId(): Promise<string> {
  const id = als.getStore()?.userId ?? (process.env.VITEST ? testUserId : null) ?? (requestResolver ? await requestResolver().catch(() => null) : null);
  if (!id) throw new Error("Sem usuário no contexto: consulta bloqueada.");
  return id;
}
/** Somente testes: usuário do contexto de teste. */
export function currentUserId(): string {
  const id = als.getStore()?.userId ?? (process.env.VITEST ? testUserId : null);
  if (!id) throw new Error("Sem usuário no contexto: consulta bloqueada.");
  return id;
}

const SCOPED = new Set([
  "Account", "Category", "Transfer", "CreditCard", "Invoice", "InstallmentPlan", "RecurringCommitment", "Transaction", "Budget",
  "Goal", "GoalEntry", "Debt", "Asset", "Notification", "Investment", "InvestmentEntry", "PushSubscription", "PushSlot", "ApiToken", "BankLink", "BankLinkAccount",
]);

const withoutOwner = <T,>(d: T): T => { if (d && typeof d === "object") { const c = { ...(d as object) } as Record<string, unknown>; delete c.userId; delete c.user; return c as T; } return d; };

export const prisma = prismaRaw.$extends({
  name: "escopo-por-usuario",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!SCOPED.has(model)) return query(args);
        const userId = await resolveUserId();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a: any = { ...args };
        switch (operation) {
          case "create": a.data = { ...a.data, userId }; break;
          case "createMany": case "createManyAndReturn":
            a.data = Array.isArray(a.data) ? a.data.map((x: object) => ({ ...x, userId })) : { ...a.data, userId }; break;
          case "upsert": a.where = { ...a.where, userId }; a.create = { ...a.create, userId }; a.update = withoutOwner(a.update); break;
          case "update": a.where = { ...a.where, userId }; a.data = withoutOwner(a.data); break;
          case "updateMany": case "updateManyAndReturn": a.where = a.where ? { AND: [a.where, { userId }] } : { userId }; a.data = withoutOwner(a.data); break;
          case "findUnique": case "findUniqueOrThrow": case "delete": a.where = { ...a.where, userId }; break;
          case "findFirst": case "findFirstOrThrow": case "findMany": case "count": case "aggregate": case "groupBy": case "deleteMany":
            a.where = a.where ? { AND: [a.where, { userId }] } : { userId }; break;
          default: throw new Error(`Operação não permitida no cliente com escopo: ${operation}`);
        }
        return query(a);
      },
    },
  },
});

export type Db = typeof prisma | Tx;
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Perfil do usuário do contexto atual. */
export const currentProfile = async () => prismaRaw.profile.findUnique({ where: { id: await resolveUserId() } });
