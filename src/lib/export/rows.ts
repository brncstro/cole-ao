import { computeCard } from "../calc";
import { PROFIT_KIND_LABEL, STATUS_LABEL, type CardRow, type ProfitKind } from "../types";

/** Linha pronta a exportar. PDF e Excel usam EXATAMENTE esta estrutura (e os cálculos de calc.ts). */
export interface ExportRow {
  ref: string;
  name: string;
  set: string | null;
  number: string | null;
  category: string | null;
  language: string | null;
  condition: string | null;
  source: string | null;
  purchaseDate: string | null;
  purchase: number;
  purchaseShipping: number | null;
  totalCost: number;
  status: string;
  platform: string | null;
  salePrice: number | null; // aplicável: final se vendida, previsto caso contrário
  salePriceKind: "final" | "previsto" | null;
  saleDate: string | null;
  /** Portes cobrados ao comprador (0 = grátis). */
  buyerShipping: number;
  /** Total pago pelo comprador = preço aplicável + portes cobrados (bruto, antes de taxas). null sem preço. */
  totalPaid: number | null;
  /** Custo real do envio. */
  saleShipping: number | null;
  packaging: number | null;
  fees: number | null;
  feesManual: boolean;
  profit: number | null;
  margin: number | null; // %
  kind: ProfitKind;
  kindLabel: string;
  notes: string | null;
  frontPath: string | null;
}

export function toExportRow(c: CardRow): ExportRow {
  const k = computeCard(c);
  return {
    ref: c.ref,
    name: c.name,
    set: c.set_name,
    number: c.card_number,
    category: c.category,
    language: c.language,
    condition: c.condition,
    source: c.purchase_source,
    purchaseDate: c.purchase_date,
    purchase: c.purchase_price_cents,
    purchaseShipping: c.purchase_shipping_cents,
    totalCost: k.totalCost,
    status: STATUS_LABEL[c.status],
    platform: c.sale_platform,
    salePrice: k.applicablePrice,
    salePriceKind: k.applicablePrice == null ? null : c.status === "sold" ? "final" : "previsto",
    saleDate: c.sale_date,
    buyerShipping: k.buyerShipping,
    totalPaid: k.totalPaid,
    saleShipping: c.sale_shipping_cents,
    packaging: c.packaging_cents,
    fees: k.fees,
    feesManual: k.feesAreManual,
    profit: k.profit,
    margin: k.margin,
    kind: k.profitKind,
    kindLabel: PROFIT_KIND_LABEL[k.profitKind],
    notes: c.notes,
    frontPath: c.front_path,
  };
}

export interface ExportMeta {
  appName: string;
  exportedAt: Date;
  scopeLabel: string;
  filters: string[];
  sortLabel: string;
  count: number;
}

export interface ExportOptions {
  summary: boolean;
  thumbnails: boolean;
  pageSize: "A3" | "A4";
}
