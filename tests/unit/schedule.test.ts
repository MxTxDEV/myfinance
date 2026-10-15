import { describe, expect, it } from "vitest";
import { dueStage, formatHHMM, localInstant, localParts, parseHHMM, randomMinutes } from "@/domain/schedule";
import { INVEST_MESSAGES } from "@/domain/messages-invest";
import { MESSAGES, pickMessage, stripEmoji, styleMessage } from "@/domain/messages";
import { MOTIVATION_MESSAGES } from "@/domain/messages-motivation";
import { budgetWin, debtPaid, goalDone, goalMilestone, monthWin } from "@/domain/celebrations";
import { DEFAULT_PREFS, pushPrefsSchema, readPrefs } from "@/server/push-prefs";

describe("horários aleatórios", () => {
  const base = { startMin: 6 * 60 + 30, endMin: 22 * 60, count: 5, gapMin: 60, seed: "2026-10-16" };
  it("fica dentro da janela, respeita o intervalo mínimo e a quantidade", () => {
    for (let i = 0; i < 200; i++) {
      const r = randomMinutes({ ...base, seed: `s${i}` });
      expect(r).toHaveLength(5);
      expect(r[0]).toBeGreaterThanOrEqual(base.startMin);
      expect(r[r.length - 1]).toBeLessThanOrEqual(base.endMin);
      for (let k = 1; k < r.length; k++) expect(r[k] - r[k - 1]).toBeGreaterThanOrEqual(60);
    }
  });
  it("é estável para a mesma semente e varia entre sementes", () => {
    expect(randomMinutes(base)).toEqual(randomMinutes(base));
    const sets = new Set(Array.from({ length: 30 }, (_, i) => randomMinutes({ ...base, seed: `d${i}` }).join(",")));
    expect(sets.size).toBeGreaterThan(20);
  });
  it("reduz a quantidade quando não cabe e lida com casos vazios", () => {
    expect(randomMinutes({ ...base, startMin: 600, endMin: 700, count: 10 }).length).toBeLessThanOrEqual(2);
    expect(randomMinutes({ ...base, count: 0 })).toEqual([]);
    expect(randomMinutes({ ...base, startMin: 900, endMin: 800 })).toEqual([]);
  });
  it("distribui ao longo do dia (não concentra tudo no começo)", () => {
    const avg = Array.from({ length: 300 }, (_, i) => randomMinutes({ ...base, seed: `m${i}` }).reduce((a, b) => a + b, 0) / 5).reduce((a, b) => a + b, 0) / 300;
    expect(avg).toBeGreaterThan(12 * 60); expect(avg).toBeLessThan(16 * 60); // meio da janela ≈ 14:15
  });
});

describe("fuso de São Paulo", () => {
  it("converte hora local ↔ instante", () => {
    expect(localInstant("2026-10-16", 6 * 60).toISOString()).toBe("2026-10-16T09:00:00.000Z"); // 06:00 BRT = 09:00 UTC
    expect(localParts(new Date("2026-10-16T01:30:00Z"))).toEqual({ day: "2026-10-15", minutes: 22 * 60 + 30 });
    expect(parseHHMM("22:00")).toBe(1320); expect(parseHHMM("24:00")).toBeNull(); expect(formatHHMM(390)).toBe("06:30");
  });
});

describe("estágios de aviso", () => {
  it("cada vencimento avisa no menor estágio já alcançado", () => {
    const st = [3, 1, 0];
    expect([5, 4, 3, 2, 1, 0].map((d) => dueStage(d, st))).toEqual([null, null, 3, 3, 1, 0]);
    expect(dueStage(-1, st)).toBeNull();
    expect(dueStage(2, [0])).toBeNull();
  });
});

describe("mensagens com emoji", () => {
  it("tem banco de incentivo grande, único e com emoji", () => {
    expect(INVEST_MESSAGES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(INVEST_MESSAGES).size).toBe(INVEST_MESSAGES.length);
    for (const m of INVEST_MESSAGES) { expect(/^\p{Extended_Pictographic}/u.test(m)).toBe(true); expect(m.length).toBeLessThanOrEqual(260); }
  });
  it("aplica e remove emoji de forma estável", () => {
    const plain = MESSAGES[0];
    const withEmoji = styleMessage(plain, true);
    expect(withEmoji).toBe(styleMessage(plain, true));
    expect(/^\p{Extended_Pictographic}/u.test(withEmoji)).toBe(true);
    expect(styleMessage(plain, false)).toBe(plain);
    expect(stripEmoji(styleMessage(INVEST_MESSAGES[0], false))).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it("não repete mensagens dentro de um ciclo", () => {
    const n = INVEST_MESSAGES.length;
    const seen = new Set(Array.from({ length: n }, (_, i) => pickMessage(INVEST_MESSAGES, i)));
    expect(seen.size).toBe(n);
  });
});

describe("preferências", () => {
  it("padrão válido: 06:00–22:00, 4 mensagens, avisos 3/1/0 dias", () => {
    expect(pushPrefsSchema.safeParse(DEFAULT_PREFS).success).toBe(true);
    expect(DEFAULT_PREFS).toMatchObject({ windowStart: "06:00", windowEnd: "22:00", perDay: 4, stages: [3, 1, 0] });
  });
  it("completa o que falta e ignora valores inválidos", () => {
    expect(readPrefs({ menu: { perDay: 7 } }).perDay).toBe(7);
    expect(readPrefs({ menu: { perDay: 7 } }).windowEnd).toBe("22:00");
    expect(readPrefs({ menu: { windowStart: "23:00", windowEnd: "08:00" } })).toEqual(DEFAULT_PREFS); // janela invertida → padrão
    expect(readPrefs(null)).toEqual(DEFAULT_PREFS);
  });
});

describe("incentivo e parabéns", () => {
  it("banco de incentivo: grande, único, com emoji e sem insultos", () => {
    expect(MOTIVATION_MESSAGES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(MOTIVATION_MESSAGES).size).toBe(MOTIVATION_MESSAGES.length);
    for (const m of MOTIVATION_MESSAGES) { expect(/^\p{Extended_Pictographic}/u.test(m)).toBe(true); expect(m.length).toBeLessThanOrEqual(260); expect(m).not.toMatch(/idiota|burro|imbecil|inútil|lixo de pessoa/i); }
    const n = MOTIVATION_MESSAGES.length;
    expect(new Set(Array.from({ length: n }, (_, i) => pickMessage(MOTIVATION_MESSAGES, i))).size).toBe(n);
  });
  it("textos de parabéns citam o nome, são estáveis e não expõem valores em reais", () => {
    const g = goalDone("Reserva", "g1");
    expect(g.body).toContain("Reserva"); expect(g).toEqual(goalDone("Reserva", "g1"));
    expect(goalMilestone("Carro", 75, "x").body).toContain("75%");
    expect(goalMilestone("Carro", 50, "x").body).toContain("Carro");
    expect(debtPaid("Financiamento").title).toContain("QUITADA");
    expect(monthWin("setembro de 2026", 18.5).body).toContain("18.5%");
    expect(monthWin("setembro de 2026", null).body).not.toContain("null");
    expect(budgetWin("setembro de 2026", 3).body).toContain("3 orçamentos");
    for (const c of [g, debtPaid("X"), monthWin("m", 10), budgetWin("m", 1)]) expect(c.body).not.toMatch(/R\$ \d/);
  });
});
