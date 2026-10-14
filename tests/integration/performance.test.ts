import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetDb, seedBasics } from "./helpers";
import { listTransactions } from "@/server/services/ledger";
import { dashboard, monthSummary } from "@/server/services/reports";
import { accountBalances } from "@/server/services/accounts";
import { d } from "@/domain/dates";

describe("desempenho com 10.000 movimentações", () => {
  beforeAll(async () => {
    await resetDb();
    const s = await seedBasics();
    const rows = Array.from({ length: 10_000 }, (_, i) => ({
      type: (i % 5 === 0 ? "INCOME" : "EXPENSE") as "INCOME" | "EXPENSE", status: "SETTLED" as const, amount: ((i % 997) + 1).toString() + ".50",
      description: `Movimento ${i}`, date: new Date(Date.UTC(2025, 0, 1 + (i % 600))), accountId: s.bank.id,
      categoryId: i % 5 === 0 ? s.salary.id : s.food.id,
    }));
    await prisma.transaction.createMany({ data: rows });
  }, 60_000);

  const time = async <T>(fn: () => Promise<T>) => { const t = performance.now(); const r = await fn(); return { r, ms: performance.now() - t }; };

  it("lista paginada, busca e totais respondem rápido", async () => {
    const a = await time(() => listTransactions({}));
    expect(a.r.total).toBe(10_000);
    expect(a.r.items).toHaveLength(50);
    expect(a.ms).toBeLessThan(800);
    const b = await time(() => listTransactions({ q: "Movimento 99", sort: "amount_desc" }));
    expect(b.r.total).toBeGreaterThan(0);
    expect(b.ms).toBeLessThan(800);
  });
  it("painel, saldos e resumo mensal respondem rápido", async () => {
    expect((await time(() => accountBalances())).ms).toBeLessThan(1500);
    expect((await time(() => monthSummary("2025-06"))).ms).toBeLessThan(800);
    expect((await time(() => dashboard(d(2026, 10, 14)))).ms).toBeLessThan(2500);
  });
});
