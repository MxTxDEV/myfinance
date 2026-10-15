import { describe, expect, it } from "vitest";
import { itemsToLines, parsePDFText, PDF_MARKER } from "@/domain/statement-pdf";

const T = (s: string) => `${PDF_MARKER}\n${s}`;

describe("linhas a partir dos pedaços de texto do PDF", () => {
  it("agrupa por altura e ordena por posição, mantendo colunas separadas", () => {
    const lines = itemsToLines([
      { str: "-86,50", x: 400, y: 700, w: 30 }, { str: "14/10/2026", x: 20, y: 700.5, w: 50 }, { str: "MERCADO", x: 90, y: 700, w: 40 }, { str: "SAO JOAO", x: 133, y: 700, w: 40 },
      { str: "05/10/2026", x: 20, y: 680, w: 50 }, { str: "SALARIO", x: 90, y: 680, w: 40 }, { str: "4.600,00", x: 400, y: 680, w: 40 },
    ]);
    expect(lines).toEqual(["14/10/2026  MERCADO SAO JOAO  -86,50", "05/10/2026  SALARIO  4.600,00"]);
  });
});

describe("extrato de conta em PDF", () => {
  it("usa a variação do saldo para saber entrada e saída", () => {
    const r = parsePDFText(T(`
EXTRATO CONTA CORRENTE  Período 01/10/2026 a 31/10/2026
SALDO ANTERIOR 1.000,00
05/10/2026 SALARIO EMPRESA X 4.600,00 5.600,00
13/10/2026 MERCADO SAO JOAO 86,50 5.513,50
14/10/2026 ACADEMIA 120,00 5.393,50
Página 1 de 1`));
    expect(r.rows.map((x) => [x.date, x.description, x.amount])).toEqual([
      ["2026-10-05", "SALARIO EMPRESA X", 460000], ["2026-10-13", "MERCADO SAO JOAO", -8650], ["2026-10-14", "ACADEMIA", -12000],
    ]);
    expect(r.rows.every((x) => !x.signUnknown)).toBe(true);
  });
  it("entende marcadores D/C, sinal e parênteses; ignora saldos e totais", () => {
    const r = parsePDFText(T(`
14/10/2026 PIX RECEBIDO JOAO 250,00 C
15/10/2026 TARIFA PACOTE 39,90 D
16/10/2026 COMPRA LOJA X -75,00
17/10/2026 AJUSTE (10,00)
18/10/2026 SALDO DO DIA 1.234,56
TOTAL DE DESPESAS 1.000,00`));
    expect(r.rows.map((x) => x.amount)).toEqual([25000, -3990, -7500, -1000]);
  });
  it("sem marcador: sinal 'não identificado' com sugestão pelas palavras", () => {
    const r = parsePDFText(T(`
14/10/2026 DEPOSITO RECEBIDO 300,00
15/10/2026 PAGAMENTO BOLETO LUZ 104,00
16/10/2026 XYZ COMERCIO 20,00`));
    expect(r.rows.map((x) => [x.signUnknown, x.hintType])).toEqual([[true, "INCOME"], [true, "EXPENSE"], [true, undefined]]);
  });
  it("data sem ano usa o ano do documento", () => {
    const r = parsePDFText(T(`Emitido em 20/10/2026\n13/10 MERCADO 86,50 -`));
    expect(r.rows[0]).toMatchObject({ date: "2026-10-13", amount: -8650 });
  });
});

describe("fatura de cartão em PDF", () => {
  it("datas com mês por extenso, parcelas e créditos", () => {
    const r = parsePDFText(T(`
FATURA CARTÃO ROXO  Vencimento 17/11/2026  Total da fatura R$ 191,80
05 OUT NETFLIX 55,90
11 OUT PADARIA CENTRO 35,90
12 OUT LOJA ELETRO PARC 03/10 100,00
14 OUT PAGAMENTO RECEBIDO -155,90
Limite total R$ 5.000,00`));
    expect(r.rows.map((x) => [x.date, x.description, x.amount])).toEqual([
      ["2026-10-05", "NETFLIX", 5590], ["2026-10-11", "PADARIA CENTRO", 3590], ["2026-10-12", "LOJA ELETRO PARC 03/10", 10000], ["2026-10-14", "PAGAMENTO RECEBIDO", -15590],
    ]);
  });
  it("PDF sem nada reconhecível avisa em vez de inventar", () => {
    const r = parsePDFText(T("apenas texto solto\noutra linha"));
    expect(r.rows).toHaveLength(0); expect(r.warnings[0]).toMatch(/imagem|layout/);
  });
});
