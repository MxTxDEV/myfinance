import { describe, expect, it } from "vitest";
import { INVEST_EXTRA_MESSAGES, MOTIVATION_EXTRA_MESSAGES, SMALL_SPEND_MESSAGES, SPEND_EXTRA_MESSAGES } from "@/domain/messages-extra";
import { INVEST_MESSAGES } from "@/domain/messages-invest";
import { MESSAGES } from "@/domain/messages";
import { MOTIVATION_MESSAGES } from "@/domain/messages-motivation";
import { personalMessages, type PersonalStats } from "@/domain/messages-personal";

describe("bancos de mensagens", () => {
  it("cada banco passa de 100 frases, sem repetição e sem estourar o tamanho da notificação", () => {
    for (const bank of [[...MESSAGES, ...SPEND_EXTRA_MESSAGES], [...INVEST_MESSAGES, ...INVEST_EXTRA_MESSAGES], [...MOTIVATION_MESSAGES, ...MOTIVATION_EXTRA_MESSAGES]]) {
      expect(bank.length).toBeGreaterThanOrEqual(100);
      expect(new Set(bank).size).toBe(bank.length);
      for (const m of bank) expect(m.length).toBeLessThanOrEqual(300);
    }
  });
  it("as contas geradas estão certas", () => {
    expect(SMALL_SPEND_MESSAGES.some((m) => m.includes("R$ 5 por dia são R$ 150 por mês e R$ 1.825 por ano"))).toBe(true); // 5 × 30 e 5 × 365
    const num = (t: string) => Number(t.replace(/\./g, ""));
    for (const m of SMALL_SPEND_MESSAGES) { // confere TODA frase "R$ A por dia são R$ M por mês e R$ Y por ano"
      const x = /R\$ ([\d.]+) por dia são R\$ ([\d.]+) por mês e R\$ ([\d.]+) por ano/.exec(m);
      if (x) { expect(num(x[2])).toBe(num(x[1]) * 30); expect(num(x[3])).toBe(num(x[1]) * 365); }
    }
    expect(INVEST_EXTRA_MESSAGES.some((m) => m.includes("R$ 100 por mês") && m.includes("R$ 4.800"))).toBe(true); // 100 × 12 × 4
  });
});

const stats = (o: Partial<PersonalStats> = {}): PersonalStats => ({
  smallLimit: 3000, today: { smallCount: 0, smallTotal: 0 }, week: { smallCount: 0, smallTotal: 0 },
  month: { smallCount: 0, smallTotal: 0, spent: 0, income: 0, day: 10, daysInMonth: 30 }, topCategory: null, fixedMonthly: 0, debt: { total: 0, monthlyInterest: 0, count: 0 }, ...o,
});

describe("mensagens personalizadas", () => {
  it("sem dados não inventa nada", () => { expect(personalMessages(stats())).toEqual([]); });
  it("compras pequenas acumuladas usam os números reais", () => {
    const m = personalMessages(stats({ week: { smallCount: 7, smallTotal: 14000 } }));
    expect(m).toHaveLength(1);
    expect(m[0]).toContain("7 compras");
    expect(m[0]).toContain("R$ 140,00");
    expect(m[0]).toContain("R$ 600,00"); // 140 × 30 ÷ 7
  });
  it("ritmo do mês: projeta acima da renda e diz quanto fica no negativo", () => {
    const m = personalMessages(stats({ month: { smallCount: 0, smallTotal: 0, spent: 200000, income: 400000, day: 10, daysInMonth: 30 } }));
    expect(m.join(" ")).toContain("R$ 6.000,00"); // 2.000 ÷ 10 × 30
    expect(m.join(" ")).toContain("R$ 2.000,00 no negativo");
  });
  it("dívidas e despesas fixas aparecem quando existem", () => {
    const m = personalMessages(stats({ month: { smallCount: 0, smallTotal: 0, spent: 0, income: 500000, day: 3, daysInMonth: 30 }, fixedMonthly: 200000, debt: { total: 1500000, monthlyInterest: 90000, count: 2 } })).join("\n");
    expect(m).toContain("40%"); expect(m).toContain("R$ 3.000,00"); expect(m).toContain("2 dívidas"); expect(m).toContain("R$ 900,00");
  });
});
