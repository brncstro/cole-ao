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
    sale_date: sold ? "2026-02-01" : null, sale_shipping_cents: 250, packaging_cents: 50,
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
    const H: Record<string, string> = { purchase: "Preço de compra", cost: "Custo total", fees: "Taxas", profit: "Lucro", margin: "Margem sobre o custo", pdate: "Data de compra" };
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
});
