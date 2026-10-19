import { describe, expect, it } from "vitest";
import fs from "node:fs";
import ExcelJS from "exceljs";
import { buildPdf } from "./pdf";
import { buildXlsx } from "./xlsx";
import { toExportRow } from "./rows";
import { summarize } from "../summary";
import type { CardRow } from "../types";

const OUT = process.env.EXPORT_OUT ?? "/tmp";

function mk(i: number): CardRow {
  const sold = i % 3 === 0;
  const sale = i % 3 === 1;
  return {
    id: String(i), user_id: "u", ref: `C-${String(i).padStart(4, "0")}`,
    name: i % 7 === 0 ? "Charizard Holo 1ª Edição — Edição Especial de Coleção com um nome extremamente longo para testar a quebra de linha sem cortar" : `Évoli Ção ${i}`,
    set_name: "Base Set", card_number: `${i}/102`, category: "Pokémon", language: "Português",
    condition: "Near Mint (NM)", grading_company: null, grading_grade: null, notes: "Nota com acentos: ção, ã, é",
    front_path: null, back_path: null, purchase_source: "Cardmarket", purchase_date: "2026-01-15",
    purchase_price_cents: 12000 + i, purchase_shipping_cents: i % 2 ? 350 : null,
    status: sold ? "sold" : sale ? "for_sale" : "collection", sale_platform: sold || sale ? "eBay" : null,
    expected_price_cents: i % 5 === 0 ? null : 15000, final_price_cents: sold ? 14500 : null,
    sale_date: sold ? "2026-02-01" : null, sale_shipping_cents: 250, packaging_cents: 50, buyer_shipping_cents: i % 4 === 0 ? 150 : 0, fee_on_shipping: i % 8 === 0,
    fee_percent: 5, fee_fixed_cents: null, fee_actual_cents: sold && i % 2 ? 725 : null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("exportações", () => {
  const cards = Array.from({ length: 120 }, (_, i) => mk(i + 1));
  const rows = cards.map(toExportRow);
  const summary = summarize(cards);
  const meta = { appName: "A Minha Coleção", exportedAt: new Date("2026-10-18T14:00:00Z"), scopeLabel: "Toda a coleção", filters: [], sortLabel: "Referência (crescente)", count: rows.length };

  it("PDF A3 e A4 com várias páginas", async () => {
    for (const size of ["A3", "A4"] as const) {
      const buf = await buildPdf({ rows, summary, meta, options: { summary: true, thumbnails: false, pageSize: size } });
      fs.writeFileSync(`${OUT}/test-${size}.pdf`, buf);
      expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    }
  });

  it("Excel com tipos corretos", async () => {
    const buf = await buildXlsx({ rows, summary, meta });
    fs.writeFileSync(`${OUT}/test.xlsx`, buf);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Cartas", "Resumo"]);
    const ws = wb.getWorksheet("Cartas")!;
    expect(ws.rowCount).toBe(121);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
    const r3 = ws.getRow(4); // carta 3: vendida, i%2=1 → taxa efetiva 7,25
    const H: Record<string, string> = { purchase: "Preço de compra", cost: "Custo total", fees: "Taxas", profit: "Lucro", margin: "Margem sobre o custo", pdate: "Data de compra", bship: "Portes cobrados ao comprador", paid: "Total pago pelo comprador", sship: "Custo real do envio", sale: "Preço da carta (aplicável)" };
    const col = (k: string) => { let n = 0; ws.getRow(1).eachCell((c, i) => { if (c.value === H[k]) n = i; }); return n; };
    const val = (k: string) => r3.getCell(col(k)).value;
    expect(typeof val("purchase")).toBe("number");
    expect(val("purchase")).toBeCloseTo(120.03);
    expect(val("cost")).toBeCloseTo(123.53);
    expect(val("fees")).toBeCloseTo(7.25);
    expect(val("profit")).toBeCloseTo(145 - 7.25 - 2.5 - 0.5 - 123.53);
    expect(typeof val("margin")).toBe("number");
    expect(val("pdate")).toBeInstanceOf(Date);
    expect(r3.getCell(col("purchase")).numFmt).toContain("€");
    expect(r3.getCell(col("margin")).numFmt).toContain("%");
    // coerência com a app: soma dos lucros das vendidas = resumo
    const sumProfitSold = rows.filter((r) => r.kind === "realized").reduce((s, r) => s + (r.profit ?? 0), 0);
    expect(sumProfitSold).toBe(summary.realizedProfit);
  });

  it("Excel e PDF: portes cobrados, total pago e lucro coerentes com a aplicação (exemplo 4,50 € / 0,75 €)", async () => {
    const mkc = (id: string, over: Partial<CardRow>): CardRow => ({ ...mk(1), id, ref: `E-${id}`, name: `Exemplo ${id}`, status: "sold", sale_date: "2026-02-01", purchase_price_cents: 225, purchase_shipping_cents: null, final_price_cents: 300, expected_price_cents: null, packaging_cents: 0, fee_actual_cents: 0, fee_percent: null, fee_fixed_cents: null, fee_on_shipping: false, ...over });
    const ex = [
      mkc("1", { buyer_shipping_cents: 150, sale_shipping_cents: 150 }),   // 4,50 € / 0,75 €
      mkc("2", { buyer_shipping_cents: 0, sale_shipping_cents: 150 }),     // portes grátis: 3,00 € / −0,75 €
      mkc("3", { buyer_shipping_cents: 200, sale_shipping_cents: 150 }),   // cobrado ≠ custo real: 5,00 € / 1,25 €
      mkc("4", { status: "for_sale", sale_date: null, final_price_cents: null, expected_price_cents: 300, buyer_shipping_cents: 150, sale_shipping_cents: 150 }), // estimado 4,50 € / 0,75 €
    ];
    const r = ex.map(toExportRow);
    const sm = summarize(ex);
    const m = { ...meta, count: r.length };
    const buf = await buildXlsx({ rows: r, summary: sm, meta: m });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Cartas")!;
    const head: Record<string, number> = {};
    ws.getRow(1).eachCell((c, i) => (head[String(c.value)] = i));
    expect(head["Custo real do envio"]).toBeGreaterThan(0);
    expect(head["Portes de venda"]).toBeUndefined(); // rótulo antigo já não existe
    const get = (row: number, h: string) => ws.getRow(row).getCell(head[h]).value;
    expect(get(2, "Total pago pelo comprador")).toBeCloseTo(4.5);
    expect(get(2, "Lucro")).toBeCloseTo(0.75);
    expect(get(3, "Portes cobrados ao comprador")).toBe(0);
    expect(get(3, "Total pago pelo comprador")).toBeCloseTo(3);
    expect(get(3, "Lucro")).toBeCloseTo(-0.75);
    expect(get(4, "Total pago pelo comprador")).toBeCloseTo(5);
    expect(get(4, "Lucro")).toBeCloseTo(1.25);
    expect(get(5, "Tipo de lucro")).toBe("Estimado");
    expect(get(5, "Lucro")).toBeCloseTo(0.75);
    // Resumo: receita das cartas, portes cobrados e total recebido separados (só vendidas), sem duplicação
    const rs = wb.getWorksheet("Resumo")!;
    const find = (label: string) => { let v: unknown = null; rs.eachRow((row) => { if (row.getCell(1).value === label) v = row.getCell(2).value; }); return v as number; };
    expect(find("Receita das cartas")).toBeCloseTo(9);          // 3 + 3 + 3
    expect(find("Portes cobrados aos compradores")).toBeCloseTo(3.5); // 1,5 + 0 + 2 (a estimada fica de fora)
    expect(find("Total recebido dos compradores")).toBeCloseTo(12.5);
    expect(find("Custo real do envio")).toBeCloseTo(4.5);
    expect(find("Lucro realizado")).toBeCloseTo(0.75 - 0.75 + 1.25);
    // PDF gera-se sem erros com as novas colunas
    const pdf = await buildPdf({ rows: r, summary: sm, meta: m, options: { summary: true, thumbnails: false, pageSize: "A3" } });
    fs.writeFileSync(`${OUT}/test-portes.pdf`, pdf);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const pdfA4 = await buildPdf({ rows: r, summary: sm, meta: m, options: { summary: true, thumbnails: false, pageSize: "A4" } });
    fs.writeFileSync(`${OUT}/test-portes-A4.pdf`, pdfA4);
  });
});
