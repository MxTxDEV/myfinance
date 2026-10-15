import { describe, expect, it } from "vitest";
import { MESSAGES, messageDayKey, messageForDay } from "@/domain/messages";
import { investmentSummary } from "@/domain/planning";

describe("banco de mensagens", () => {
  it("tem pelo menos 90 mensagens, únicas e de tamanho adequado para notificação", () => {
    expect(MESSAGES.length).toBeGreaterThanOrEqual(90);
    expect(new Set(MESSAGES).size).toBe(MESSAGES.length);
    for (const m of MESSAGES) { expect(m.length).toBeGreaterThan(20); expect(m.length).toBeLessThanOrEqual(260); }
  });
  it("é determinística por data e não repete dentro de um ciclo", () => {
    expect(messageForDay("2026-10-15")).toBe(messageForDay("2026-10-15"));
    const seen = new Set<string>();
    const start = Date.UTC(2026, 0, 1);
    // Um ciclo completo alinhado ao calendário de dias: N dias consecutivos dentro do mesmo ciclo.
    const n = MESSAGES.length;
    const firstDay = Math.ceil(start / 86_400_000 / n) * n; // início de um ciclo
    for (let i = 0; i < n; i++) seen.add(messageForDay(new Date((firstDay + i) * 86_400_000).toISOString().slice(0, 10)));
    expect(seen.size).toBe(n);
  });
  it("o dia da mensagem começa às 06:00 de Brasília", () => {
    expect(messageDayKey(new Date("2026-10-15T08:59:00Z"))).toBe("2026-10-14"); // 05:59 BRT
    expect(messageDayKey(new Date("2026-10-15T09:00:00Z"))).toBe("2026-10-15"); // 06:00 BRT
    expect(messageDayKey(new Date("2026-10-16T01:00:00Z"))).toBe("2026-10-15"); // 22:00 BRT
  });
});

describe("rentabilidade de investimento", () => {
  it("retorno e percentual", () => {
    expect(investmentSummary({ contributed: 100000, withdrawn: 0, currentValue: 110000 })).toEqual({ netInvested: 100000, totalReturn: 10000, returnPercent: 10 });
    expect(investmentSummary({ contributed: 100000, withdrawn: 50000, currentValue: 60000 })).toEqual({ netInvested: 50000, totalReturn: 10000, returnPercent: 10 });
    expect(investmentSummary({ contributed: 100000, withdrawn: 0, currentValue: 80000 }).totalReturn).toBe(-20000);
    expect(investmentSummary({ contributed: 0, withdrawn: 0, currentValue: 5000 }).returnPercent).toBeNull();
  });
});
