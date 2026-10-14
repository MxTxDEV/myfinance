import { describe, expect, it } from "vitest";
import { formatBRL, parseBRL, percent, splitInstallments, toCents, toDecimalString } from "@/domain/money";

describe("precisão monetária", () => {
  it("converte decimais sem erro de float", () => {
    expect(toCents("0.10") + toCents("0.20")).toBe(30);
    expect(toCents("19.99")).toBe(1999);
    expect(toCents("1234.5")).toBe(123450);
    expect(toCents({ toString: () => "10.500" })).toBe(1050);
    expect(toCents(-5.1)).toBe(-510);
  });
  it("rejeita valores com fração significativa extra", () => {
    expect(() => toCents("1.234")).toThrow();
    expect(() => toCents("abc")).toThrow();
  });
  it("round-trip decimal", () => {
    for (const c of [0, 1, 99, 100, 123456789, -250]) expect(toCents(toDecimalString(c))).toBe(c);
  });
  it("formata em reais brasileiros", () => {
    expect(formatBRL(460000)).toBe("R$ 4.600,00");
    expect(formatBRL(-8650)).toBe("-R$ 86,50");
  });
  it("interpreta entrada brasileira", () => {
    expect(parseBRL("1.234,56")).toBe(123456);
    expect(parseBRL("R$ 12,5")).toBe(1250);
    expect(parseBRL("12")).toBe(1200);
    expect(parseBRL("1,2,3")).toBeNull();
    expect(parseBRL("")).toBeNull();
  });
});

describe("parcelamento e arredondamento", () => {
  it("soma exata e centavos nas primeiras parcelas", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(10000, 4)).toEqual([2500, 2500, 2500, 2500]);
    expect(splitInstallments(1, 3)).toEqual([1, 0, 0]);
  });
  it("soma sempre igual ao total", () => {
    for (const total of [1, 99, 12345, 999999]) for (const n of [1, 2, 3, 7, 12, 24])
      if (total >= n) expect(splitInstallments(total, n).reduce((a, b) => a + b, 0)).toBe(total);
  });
  it("percent evita divisão por zero", () => {
    expect(percent(1, 0)).toBeNull();
    expect(percent(1, 3)).toBe(33.3);
  });
});
