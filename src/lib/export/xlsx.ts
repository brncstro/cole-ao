import ExcelJS from "exceljs";
import type { Summary } from "../summary";
import type { ExportMeta, ExportRow } from "./rows";

const EUR = '#,##0.00 "€";[Red]-#,##0.00 "€"';
const PCT = "0.0%;[Red]-0.0%";
const DATE = "dd/mm/yyyy";

/** "2026-03-09" → Date (UTC meia-noite): o Excel guarda uma data real, sem deslocação de fuso. */
function toDate(iso: string | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}
const euros = (c: number | null) => (c == null ? null : c / 100);

export async function buildXlsx(args: { rows: ExportRow[]; summary: Summary | null; meta: ExportMeta }): Promise<Buffer> {
  const { rows, summary, meta } = args;
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.appName;
  wb.created = meta.exportedAt;

  const ws = wb.addWorksheet("Cartas", { views: [{ state: "frozen", ySplit: 1 }] });
  const defs: { header: string; key: string; width: number; fmt?: string; align?: "right" }[] = [
    { header: "Referência", key: "ref", width: 12 },
    { header: "Carta", key: "name", width: 34 },
    { header: "Coleção / edição", key: "set", width: 26 },
    { header: "Conservação", key: "cond", width: 16 },
    { header: "Onde comprou", key: "source", width: 16 },
    { header: "Preço de compra", key: "purchase", width: 14, fmt: EUR },
    { header: "Portes de compra", key: "pship", width: 14, fmt: EUR },
    { header: "Custo total", key: "cost", width: 13, fmt: EUR },
    { header: "Situação", key: "status", width: 12 },
    { header: "Plataforma de venda", key: "platform", width: 18 },
    { header: "Preço de venda (aplicável)", key: "sale", width: 16, fmt: EUR },
    { header: "Portes de venda", key: "sship", width: 14, fmt: EUR },
    { header: "Embalagem", key: "pack", width: 12, fmt: EUR },
    { header: "Taxas", key: "fees", width: 12, fmt: EUR },
    { header: "Lucro", key: "profit", width: 13, fmt: EUR },
    { header: "Margem sobre o custo", key: "margin", width: 13, fmt: PCT },
    { header: "Tipo de lucro", key: "kind", width: 15 },
    { header: "Número", key: "number", width: 10 },
    { header: "Categoria", key: "category", width: 16 },
    { header: "Idioma", key: "language", width: 12 },
    { header: "Data de compra", key: "pdate", width: 14, fmt: DATE },
    { header: "Data de venda", key: "sdate", width: 14, fmt: DATE },
    { header: "Notas", key: "notes", width: 40 },
  ];
  ws.columns = defs.map((d) => ({ header: d.header, key: d.key, width: d.width, style: d.fmt ? { numFmt: d.fmt } : {} }));

  for (const r of rows) {
    ws.addRow({
      ref: r.ref,
      name: r.name,
      set: r.set,
      cond: r.condition,
      source: r.source,
      purchase: euros(r.purchase),
      pship: euros(r.purchaseShipping),
      cost: euros(r.totalCost),
      status: r.status,
      platform: r.platform,
      sale: euros(r.salePrice),
      sship: euros(r.saleShipping),
      pack: euros(r.packaging),
      fees: euros(r.fees),
      profit: euros(r.profit),
      margin: r.margin == null ? null : r.margin / 100, // fração, formatada como %
      kind: r.kindLabel,
      number: r.number,
      category: r.category,
      language: r.language,
      pdate: toDate(r.purchaseDate),
      sdate: toDate(r.saleDate),
      notes: r.notes,
    });
  }

  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2C5B60" } };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 32;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: defs.length } };
  ws.getColumn("name").alignment = { wrapText: true, vertical: "top" };
  ws.getColumn("notes").alignment = { wrapText: true, vertical: "top" };

  // ------------------------------------------------ Resumo
  const rs = wb.addWorksheet("Resumo");
  rs.columns = [
    { key: "a", width: 46 },
    { key: "b", width: 20 },
    { key: "c", width: 60 },
  ];
  const title = rs.addRow([`${meta.appName} — Resumo das cartas exportadas`]);
  title.font = { bold: true, size: 14 };
  rs.addRow([`Exportado em`, meta.exportedAt, ""]).getCell(2).numFmt = "dd/mm/yyyy hh:mm";
  rs.addRow(["Âmbito", meta.scopeLabel]);
  rs.addRow(["Cartas exportadas", meta.count]);
  if (meta.filters.length) rs.addRow(["Filtros", meta.filters.join(" · ")]);
  rs.addRow([]);

  if (summary) {
    const section = (name: string, note?: string) => {
      const r = rs.addRow([name, "", note ?? ""]);
      r.font = { bold: true, color: { argb: "FF2C5B60" } };
    };
    const line = (label: string, value: number | null, fmt: string, note?: string) => {
      const r = rs.addRow([label, value, note ?? ""]);
      r.getCell(2).numFmt = fmt;
      r.getCell(2).alignment = { horizontal: "right" };
    };
    const n = "0";
    section("Cartas");
    line("Total de cartas", summary.count, n);
    line("Em coleção", summary.countCollection, n);
    line("À venda", summary.countForSale, n);
    line("Vendidas", summary.countSold, n);
    rs.addRow([]);
    section("Compras e custos");
    line("Total gasto em compras", euros(summary.totalPurchases), EUR);
    line("Total gasto em portes de compra", euros(summary.totalPurchaseShipping), EUR);
    line("Custo total das cartas", euros(summary.totalCost), EUR);
    line("Custo das cartas ainda não vendidas", euros(summary.unsoldCost), EUR);
    rs.addRow([]);
    section("Realizado (vendas concluídas)");
    line("Receita bruta", euros(summary.revenue), EUR);
    line("Custo das cartas vendidas", euros(summary.soldCost), EUR);
    line("Taxas efetivas", euros(summary.fees), EUR);
    line("Portes de venda", euros(summary.saleShipping), EUR);
    line("Embalagens", euros(summary.packaging), EUR);
    line("Lucro realizado", euros(summary.realizedProfit), EUR);
    line("Margem global realizada", summary.realizedMargin == null ? null : summary.realizedMargin / 100, PCT, "Lucro realizado ÷ custo das cartas vendidas");
    rs.addRow([]);
    section("Estimado (não vendidas)", "Baseado em preços previstos; não é dinheiro já ganho");
    line("À venda — valor previsto", euros(summary.forSale.expectedValue), EUR);
    line("À venda — lucro estimado", euros(summary.forSale.estimatedProfit), EUR);
    line("Em coleção — valor previsto", euros(summary.inCollection.expectedValue), EUR);
    line("Em coleção — lucro estimado", euros(summary.inCollection.estimatedProfit), EUR);
    line("Cartas sem estimativa", summary.noEstimateCount, n);
    rs.addRow([]);
    section("Lucro total (realizado + estimado)");
    line("Lucro realizado + estimado", euros(summary.totalProfitMixed), EUR, "Não é dinheiro já ganho");
  } else {
    rs.addRow(["Resumo não incluído nesta exportação."]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
