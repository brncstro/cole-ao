import path from "node:path";
import PDFDocument from "pdfkit";
import { formatDate, formatEUR, formatPercent, formatSignedEUR } from "../money";
import type { Summary } from "../summary";
import type { ExportMeta, ExportOptions, ExportRow } from "./rows";

const FONT_R = path.join(process.cwd(), "assets", "fonts", "DejaVuSansCondensed.ttf");
const FONT_B = path.join(process.cwd(), "assets", "fonts", "DejaVuSansCondensed-Bold.ttf");

const INK = "#1d1f22";
const MUTED = "#62666d";
const LINE = "#d9d9d3";
const POS = "#16703f";
const NEG = "#b3261e";
const ACCENT = "#2c5b60";
const HEAD_BG = "#eaf0f0";

const clean = (s: string) => s.replace(/ /g, " ");
const eur = (c: number | null) => clean(formatEUR(c));
const signed = (c: number | null) => clean(formatSignedEUR(c));

interface Cell {
  text: string;
  sub?: string;
  color?: string;
  bold?: boolean;
}
interface Col {
  key: string;
  label: string;
  w: number; // peso relativo
  right?: boolean;
  cell?: (r: ExportRow) => Cell;
}

const dash = "—";
const t = (s: string | null | undefined): Cell => ({ text: s && s.trim() ? s : dash, color: s && s.trim() ? INK : MUTED });
const money = (c: number | null): Cell => (c == null ? { text: dash, color: MUTED } : { text: eur(c) });

/** Colunas da referência, na mesma ordem lógica. */
function columns(thumbs: boolean): Col[] {
  const cols: Col[] = [
    { key: "ref", label: "Referência", w: 68, cell: (r) => ({ text: r.ref }) },
    { key: "name", label: "Carta", w: 98, cell: (r) => ({ text: r.name, bold: true }) },
    { key: "set", label: "Coleção / edição", w: 84, cell: (r) => t([r.set, r.number].filter(Boolean).join(" · ")) },
    { key: "cond", label: "Conservação", w: 78, cell: (r) => t(r.condition) },
    { key: "source", label: "Onde comprou", w: 74, cell: (r) => t(r.source) },
    { key: "purchase", label: "Preço de compra", w: 56, right: true, cell: (r) => money(r.purchase) },
    { key: "pship", label: "Portes de compra", w: 52, right: true, cell: (r) => money(r.purchaseShipping) },
    { key: "cost", label: "Custo total", w: 58, right: true, cell: (r) => ({ text: eur(r.totalCost), bold: true }) },
    { key: "status", label: "Situação", w: 56, cell: (r) => ({ text: r.status }) },
    { key: "platform", label: "Plataforma de venda", w: 70, cell: (r) => t(r.platform) },
    {
      key: "sale",
      label: "Preço da carta",
      w: 62,
      right: true,
      cell: (r) => (r.salePrice == null ? { text: "Sem estimativa", color: MUTED } : { text: eur(r.salePrice), sub: r.salePriceKind === "final" ? "final" : "previsto" }),
    },
    { key: "bship", label: "Portes cobrados", w: 60, right: true, cell: (r) => (r.salePrice == null && !r.buyerShipping ? { text: dash, color: MUTED } : r.buyerShipping ? { text: eur(r.buyerShipping) } : { text: "Grátis", color: MUTED }) },
    { key: "paid", label: "Total pago pelo comprador", w: 72, right: true, cell: (r) => (r.totalPaid == null ? { text: dash, color: MUTED } : { text: eur(r.totalPaid), bold: true, sub: r.salePriceKind === "previsto" ? "previsto" : undefined }) },
    { key: "sship", label: "Custo real do envio", w: 52, right: true, cell: (r) => money(r.saleShipping) },
    { key: "pack", label: "Embalagem", w: 70, right: true, cell: (r) => money(r.packaging) },
    { key: "fees", label: "Taxas", w: 52, right: true, cell: (r) => (r.fees == null ? { text: dash, color: MUTED } : { text: eur(r.fees), sub: r.feesManual ? "efetivas" : undefined }) },
    {
      key: "profit",
      label: "Lucro",
      w: 62,
      right: true,
      cell: (r) => (r.profit == null ? { text: dash, color: MUTED } : { text: signed(r.profit), bold: true, color: r.profit > 0 ? POS : r.profit < 0 ? NEG : INK }),
    },
    { key: "margin", label: "Margem sobre o custo", w: 52, right: true, cell: (r) => (r.profit == null ? { text: dash, color: MUTED } : { text: clean(formatPercent(r.margin)) }) },
    { key: "kind", label: "Tipo de lucro", w: 64, cell: (r) => ({ text: r.kindLabel, color: r.kind === "none" ? MUTED : INK }) },
  ];
  if (thumbs) cols.unshift({ key: "thumb", label: "Foto", w: 38 });
  return cols;
}

export type ImageLoader = (path: string) => Promise<Buffer | null>;

export async function buildPdf(args: {
  rows: ExportRow[];
  summary: Summary | null;
  meta: ExportMeta;
  options: ExportOptions;
  loadImage?: ImageLoader;
}): Promise<Buffer> {
  const { rows, summary, meta, options } = args;
  const a3 = options.pageSize === "A3";
  const size: [number, number] = a3 ? [1190.55, 841.89] : [841.89, 595.28];
  const margin = a3 ? 36 : 26;
  const fs = a3 ? 8.5 : 6.6; // tamanho do texto (pt)
  const pad = a3 ? 4 : 2.6;

  const doc = new PDFDocument({
    size,
    margins: { top: margin, bottom: margin + 14, left: margin, right: margin },
    bufferPages: true,
    info: { Title: `${meta.appName} — relatório da coleção`, Creator: meta.appName },
  });
  doc.registerFont("R", FONT_R);
  doc.registerFont("B", FONT_B);

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res, rej) => {
    doc.on("end", () => res(Buffer.concat(chunks)));
    doc.on("error", rej);
  });

  const cols = columns(options.thumbnails);
  const usable = size[0] - margin * 2;
  const total = cols.reduce((s, c) => s + c.w, 0);
  const widths = cols.map((c) => (c.w / total) * usable);
  const xs = widths.map((_, i) => margin + widths.slice(0, i).reduce((s, w) => s + w, 0));
  const bottom = () => doc.page.height - margin - 14;
  const thumbH = a3 ? 46 : 34;
  const thumbW = Math.round(thumbH * 0.72);

  const setFont = (bold: boolean, size: number) => doc.font(bold ? "B" : "R").fontSize(size);

  // ------------------------------------------------ título
  setFont(true, a3 ? 18 : 14).fillColor(INK).text(`${meta.appName} — Relatório da coleção`, margin, margin, { width: usable });
  setFont(false, a3 ? 9.5 : 8).fillColor(MUTED);
  const when = `${formatDate(meta.exportedAt.toISOString().slice(0, 10))} ${meta.exportedAt.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" })}`;
  doc.text(`Exportado em ${when}  ·  ${meta.count} ${meta.count === 1 ? "carta" : "cartas"}  ·  Âmbito: ${meta.scopeLabel}  ·  Ordenação: ${meta.sortLabel}`, { width: usable });
  if (meta.filters.length) doc.text(`Filtros: ${meta.filters.join("  ·  ")}`, { width: usable });
  doc.moveDown(0.6);

  let y = doc.y;

  // ------------------------------------------------ cabeçalho da tabela (repetido em cada página)
  const headerH = () => {
    setFont(true, fs);
    return Math.max(...cols.map((c, i) => doc.heightOfString(c.label, { width: widths[i] - pad * 2, align: c.right ? "right" : "left" }))) + pad * 2;
  };
  const HH = headerH();
  const drawHeader = () => {
    doc.save().rect(margin, y, usable, HH).fill(HEAD_BG).restore();
    setFont(true, fs).fillColor(INK);
    cols.forEach((c, i) => doc.text(c.label, xs[i] + pad, y + pad, { width: widths[i] - pad * 2, align: c.right ? "right" : "left" }));
    doc.save().moveTo(margin, y + HH).lineTo(margin + usable, y + HH).lineWidth(0.8).strokeColor(ACCENT).stroke().restore();
    y += HH;
  };

  // Miniaturas (opcionais) — carregadas antes de desenhar
  const images = new Map<string, Buffer>();
  if (options.thumbnails && args.loadImage) {
    const paths = Array.from(new Set(rows.map((r) => r.frontPath).filter((p): p is string => !!p)));
    for (let i = 0; i < paths.length; i += 8) {
      await Promise.all(
        paths.slice(i, i + 8).map(async (p) => {
          try {
            const b = await args.loadImage!(p);
            if (b) images.set(p, b);
          } catch {}
        }),
      );
    }
  }

  const cellOf = (c: Col, r: ExportRow): Cell => c.cell?.(r) ?? { text: "" };
  drawHeader();

  if (rows.length === 0) {
    setFont(false, fs + 1).fillColor(MUTED).text("Sem cartas neste relatório.", margin, y + 8, { width: usable });
    y = doc.y;
  }

  for (const r of rows) {
    // altura da linha = a célula mais alta (nunca se corta texto)
    let h = options.thumbnails ? thumbH + pad * 2 : 0;
    const cells = cols.map((c) => cellOf(c, r));
    cols.forEach((c, i) => {
      if (c.key === "thumb") return;
      const cell = cells[i];
      setFont(!!cell.bold, fs);
      let ch = doc.heightOfString(cell.text, { width: widths[i] - pad * 2, align: c.right ? "right" : "left" });
      if (cell.sub) {
        setFont(false, fs - 1.5);
        ch += doc.heightOfString(cell.sub, { width: widths[i] - pad * 2 });
      }
      h = Math.max(h, ch + pad * 2);
    });

    if (y + h > bottom()) {
      doc.addPage();
      y = margin;
      drawHeader();
    }

    cols.forEach((c, i) => {
      const cell = cells[i];
      const x = xs[i] + pad;
      const w = widths[i] - pad * 2;
      if (c.key === "thumb") {
        const buf = r.frontPath ? images.get(r.frontPath) : undefined;
        if (buf) {
          try {
            doc.image(buf, xs[i] + (widths[i] - thumbW) / 2, y + pad, { fit: [thumbW, thumbH], align: "center", valign: "center" });
          } catch {}
        }
        return;
      }
      setFont(!!cell.bold, fs).fillColor(cell.color ?? INK);
      doc.text(cell.text, x, y + pad, { width: w, align: c.right ? "right" : "left" });
      if (cell.sub) {
        setFont(false, fs - 1.5).fillColor(MUTED);
        doc.text(cell.sub, x, doc.y, { width: w, align: c.right ? "right" : "left" });
      }
    });
    doc.save().moveTo(margin, y + h).lineTo(margin + usable, y + h).lineWidth(0.4).strokeColor(LINE).stroke().restore();
    y += h;
  }

  // ------------------------------------------------ resumo final (apenas das cartas exportadas)
  if (summary && rows.length) {
    const blocks: { title: string; rows: [string, string, string?][] }[] = [
      {
        title: "Cartas e custos",
        rows: [
          ["Total de cartas", String(summary.count)],
          ["Em coleção / À venda / Vendidas", `${summary.countCollection} / ${summary.countForSale} / ${summary.countSold}`],
          ["Total gasto em compras", eur(summary.totalPurchases)],
          ["Total gasto em portes de compra", eur(summary.totalPurchaseShipping)],
          ["Custo total das cartas", eur(summary.totalCost)],
          ["Custo das cartas não vendidas", eur(summary.unsoldCost)],
        ],
      },
      {
        title: "Realizado (vendidas)",
        rows: [
          ["Receita das cartas", eur(summary.revenue)],
          ["Portes cobrados aos compradores", eur(summary.buyerShipping)],
          ["Total recebido (receita + portes, bruto)", eur(summary.totalReceived)],
          ["Custo das cartas vendidas", eur(summary.soldCost)],
          ["Taxas efetivas", eur(summary.fees)],
          ["Custo real do envio", eur(summary.saleShipping)],
          ["Embalagens", eur(summary.packaging)],
          ["Lucro realizado", signed(summary.realizedProfit), summary.realizedProfit > 0 ? POS : summary.realizedProfit < 0 ? NEG : INK],
          ["Margem global realizada", summary.countSold === 0 ? dash : clean(formatPercent(summary.realizedMargin))],
        ],
      },
      {
        title: "Estimado (não vendidas)",
        rows: [
          ["À venda: valor previsto das cartas", eur(summary.forSale.expectedValue)],
          ["À venda: portes previstos cobrados", eur(summary.forSale.expectedBuyerShipping)],
          ["À venda: lucro estimado", signed(summary.forSale.estimatedProfit)],
          ["Em coleção: valor previsto das cartas", eur(summary.inCollection.expectedValue)],
          ["Em coleção: portes previstos cobrados", eur(summary.inCollection.expectedBuyerShipping)],
          ["Em coleção: lucro estimado", signed(summary.inCollection.estimatedProfit)],
          ["Cartas sem estimativa", String(summary.noEstimateCount)],
          ["Lucro total (realizado + estimado)", signed(summary.totalProfitMixed)],
        ],
      },
    ];
    const lh = fs + 6;
    const maxRows = Math.max(...blocks.map((b) => b.rows.length));
    const need = 24 + lh * (maxRows + 1) + 24;
    if (y + 16 + need > bottom()) {
      doc.addPage();
      y = margin;
    } else y += 16;

    setFont(true, fs + 3).fillColor(INK).text("Resumo das cartas exportadas", margin, y, { width: usable });
    y = doc.y + 6;
    const gap = 24;
    const bw = (usable - gap * 2) / 3;
    blocks.forEach((b, bi) => {
      const bx = margin + bi * (bw + gap);
      let by = y;
      setFont(true, fs + 0.5).fillColor(ACCENT).text(b.title, bx, by, { width: bw });
      by += lh + 2;
      for (const [label, value, color] of b.rows) {
        setFont(false, fs).fillColor(INK).text(label, bx, by, { width: bw * 0.62, lineBreak: false });
        setFont(true, fs).fillColor(color ?? INK).text(value, bx + bw * 0.5, by, { width: bw * 0.5, align: "right", lineBreak: false });
        doc.save().moveTo(bx, by + lh - 3).lineTo(bx + bw, by + lh - 3).lineWidth(0.3).strokeColor(LINE).stroke().restore();
        by += lh;
      }
    });
    y += lh * (maxRows + 2);
    setFont(false, fs - 0.5).fillColor(MUTED).text("Total pago pelo comprador = preço da carta + portes cobrados (valor bruto, antes de taxas). Lucro = total pago − custo real do envio − embalagem − taxas − custo total de compra. O lucro realizado refere-se a vendas concluídas; os estimados baseiam-se em preços previstos e não são dinheiro já ganho.", margin, y, { width: usable });
  }

  // ------------------------------------------------ rodapé com paginação
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // evita que o rodapé crie uma página nova
    const fy = doc.page.height - margin + 2;
    setFont(false, fs - 0.5).fillColor(MUTED);
    doc.text(meta.appName, margin, fy, { width: usable / 2, lineBreak: false });
    doc.text(`Página ${i + 1} de ${range.count}`, margin + usable / 2, fy, { width: usable / 2, align: "right", lineBreak: false });
  }

  doc.end();
  return done;
}
