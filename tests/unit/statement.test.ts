import { describe, expect, it } from "vitest";
import { importKeys, looksLikeInvoicePayment, normalizeDescription, parseAmount, parseCSV, parseDate, parseOFX, parseStatement } from "@/domain/statement";

describe("valores e datas de extrato", () => {
  it("interpreta valores no padrão brasileiro e internacional", () => {
    const cases: [string, number | null][] = [["1.234,56", 123456], ["-1.234,56", -123456], ["R$ 12,5", 1250], ["1234.56", 123456], ["-86.50", -8650],
      ["(45,90)", -4590], ["1.234", 123400], ["12.5", 1250], ["0,99", 99], ["abc", null], ["", null], ["1,234", null], ["10.000,00", 1000000], ["45,90-", -4590]];
    for (const [i, o] of cases) expect(parseAmount(i), i).toBe(o);
  });
  it("interpreta datas e recusa as inexistentes", () => {
    expect(parseDate("14/10/2026")).toBe("2026-10-14"); expect(parseDate("14-10-26")).toBe("2026-10-14");
    expect(parseDate("2026-10-14T10:00")).toBe("2026-10-14"); expect(parseDate("20261014120000[-3:BRT]")).toBe("2026-10-14");
    expect(parseDate("31/02/2026")).toBeNull(); expect(parseDate("x")).toBeNull();
  });
  it("normaliza descrições para aprender categorias", () => {
    expect(normalizeDescription("COMPRA NO DEBITO - MERCADO SAO JOAO 1234")).toBe("mercado sao joao");
    expect(normalizeDescription("Pix enviado - João Silva")).toBe("joao silva");
  });
});

describe("OFX", () => {
  const ofx = `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261013120000[-3:BRT]<TRNAMT>-86.50<FITID>ABC1<MEMO>MERCADO SAO JOAO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>4600.00<FITID>ABC2<NAME>SALARIO &amp; CIA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>xx<TRNAMT>-5.00<FITID>ABC3<MEMO>quebrada</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  it("lê transações com FITID, ignora linhas quebradas e avisa", () => {
    const r = parseStatement(ofx);
    expect(r.format).toBe("ofx");
    expect(r.rows).toEqual([
      { date: "2026-10-13", description: "MERCADO SAO JOAO", amount: -8650, externalId: "ABC1" },
      { date: "2026-10-05", description: "SALARIO & CIA", amount: 460000, externalId: "ABC2" },
    ]);
    expect(r.warnings).toHaveLength(1);
    expect(parseOFX("nada").warnings[0]).toMatch(/Nenhuma transação/);
  });
});

describe("CSV", () => {
  it("formato Nubank (vírgula, valor com ponto)", () => {
    const r = parseCSV(`Data,Valor,Identificador,Descrição\n14/10/2026,-86.50,abc-1,"Mercado, Centro"\n05/10/2026,4600.00,abc-2,Salário`);
    expect(r.rows).toEqual([
      { date: "2026-10-14", description: "Mercado, Centro", amount: -8650, externalId: "abc-1" },
      { date: "2026-10-05", description: "Salário", amount: 460000, externalId: "abc-2" },
    ]);
  });
  it("formato com ponto e vírgula, milhar e vírgula decimal", () => {
    const r = parseCSV(`Data;Histórico;Valor\n14/10/2026;PIX RECEBIDO;1.234,56\n13/10/2026;ACADEMIA;-120,00`);
    expect(r.rows.map((x) => x.amount)).toEqual([123456, -12000]);
  });
  it("colunas separadas de débito e crédito", () => {
    const r = parseCSV(`Data;Descrição;Débito;Crédito\n14/10/2026;LUZ;104,00;\n05/10/2026;SALARIO;;4.600,00`);
    expect(r.rows.map((x) => x.amount)).toEqual([-10400, 460000]);
  });
  it("avisa quando não reconhece as colunas", () => {
    expect(parseCSV("a;b;c\n1;2;3").warnings[0]).toMatch(/Não reconheci/);
  });
});

describe("chaves de importação", () => {
  it("usam o identificador do banco; sem ele, distinguem repetições e são estáveis", () => {
    const rows = [
      { date: "2026-10-14", description: "CAFE", amount: -1200 }, { date: "2026-10-14", description: "CAFE", amount: -1200 },
      { date: "2026-10-14", description: "X", amount: -100, externalId: "Z9" },
    ];
    const k = importKeys(rows);
    expect(k[0]).not.toBe(k[1]); expect(k[2]).toBe("id:Z9");
    expect(importKeys(rows)).toEqual(k);
  });
  it("reconhece pagamento de fatura no extrato", () => {
    expect(looksLikeInvoicePayment("PAGAMENTO DE FATURA CARTÃO ROXO")).toBe(true);
    expect(looksLikeInvoicePayment("Pagamento fatura Nubank")).toBe(true);
    expect(looksLikeInvoicePayment("MERCADO")).toBe(false);
  });
});
