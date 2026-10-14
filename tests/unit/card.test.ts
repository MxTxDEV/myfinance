import { describe, expect, it } from "vitest";
import { invoiceForPurchase, invoiceStatus, cycleForClosingMonth } from "@/domain/card";
import { d, iso } from "@/domain/dates";

describe("fechamento e vencimento de cartões", () => {
  it("compra antes/no dia do fechamento cai na fatura do mês", () => {
    const a = invoiceForPurchase(d(2026, 10, 9), 10, 17);
    expect(a.referenceMonth).toBe("2026-10");
    expect(iso(a.closingDate)).toBe("2026-10-10");
    expect(iso(a.dueDate)).toBe("2026-10-17");
    expect(invoiceForPurchase(d(2026, 10, 10), 10, 17).referenceMonth).toBe("2026-10");
  });
  it("compra depois do fechamento cai na fatura seguinte", () => {
    const a = invoiceForPurchase(d(2026, 10, 11), 10, 17);
    expect(a.referenceMonth).toBe("2026-11");
    expect(iso(a.dueDate)).toBe("2026-11-17");
  });
  it("vencimento antes do fechamento no calendário vai para o mês seguinte", () => {
    const c = cycleForClosingMonth(2026, 10, 25, 5);
    expect(iso(c.dueDate)).toBe("2026-11-05");
  });
  it("virada de ano", () => {
    const a = invoiceForPurchase(d(2026, 12, 28), 20, 27);
    expect(a.referenceMonth).toBe("2027-01");
    expect(iso(a.dueDate)).toBe("2027-01-27");
  });
  it("fechamento dia 31 em mês curto usa último dia", () => {
    const a = invoiceForPurchase(d(2026, 2, 28), 31, 10);
    expect(iso(a.closingDate)).toBe("2026-02-28");
    expect(a.referenceMonth).toBe("2026-02");
  });
  it("situação da fatura", () => {
    const base = { closingDate: d(2026, 10, 10), dueDate: d(2026, 10, 17) };
    expect(invoiceStatus({ ...base, total: 100, paid: 0, today: d(2026, 10, 5) })).toBe("OPEN");
    expect(invoiceStatus({ ...base, total: 100, paid: 0, today: d(2026, 10, 12) })).toBe("CLOSED");
    expect(invoiceStatus({ ...base, total: 100, paid: 40, today: d(2026, 10, 12) })).toBe("PARTIAL");
    expect(invoiceStatus({ ...base, total: 100, paid: 100, today: d(2026, 10, 12) })).toBe("PAID");
    expect(invoiceStatus({ ...base, total: 100, paid: 0, today: d(2026, 10, 18) })).toBe("OVERDUE");
  });
});
