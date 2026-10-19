import type { CardRow, ProfitKind } from "./types";

/**
 * Fonte única de verdade para todos os cálculos (ficha, tabela, resumo, PDF, Excel).
 * Tudo em cêntimos inteiros.
 *
 * Em branco (null) ≠ zero:
 *  - portes, embalagem, taxas: em branco conta como 0 no cálculo (não há despesa registada);
 *  - registos anteriores à existência dos portes cobrados (campos em falta) contam como 0 / false,
 *    o que reproduz exatamente o lucro antigo;
 *  - preço previsto em branco = "Sem estimativa" (nunca 0);
 *  - taxa efetiva: se preenchida (mesmo 0) prevalece sobre a calculada.
 */

export type FinancialInput = Pick<
  CardRow,
  | "status"
  | "purchase_price_cents"
  | "purchase_shipping_cents"
  | "expected_price_cents"
  | "final_price_cents"
  | "sale_shipping_cents"
  | "buyer_shipping_cents"
  | "fee_on_shipping"
  | "packaging_cents"
  | "fee_percent"
  | "fee_fixed_cents"
  | "fee_actual_cents"
>;

export interface Computed {
  totalCost: number;
  /** Preço de venda aplicável: final se vendida; previsto caso contrário; null se não existir. */
  applicablePrice: number | null;
  /** Portes cobrados ao comprador (0 = grátis). */
  buyerShipping: number;
  /** Total pago pelo comprador = preço da carta + portes cobrados (bruto; NÃO é o valor líquido após taxas). null sem preço. */
  totalPaid: number | null;
  /** Base sobre a qual incide a taxa percentual (preço, ou preço + portes cobrados se a plataforma o exigir). */
  feeBase: number | null;
  fees: number | null; // null quando não há preço aplicável
  feesAreManual: boolean;
  /** Custo real do envio. */
  saleShipping: number;
  packaging: number;
  profit: number | null;
  /** Margem sobre o custo em %, null se custo 0 ou sem estimativa. */
  margin: number | null;
  profitKind: ProfitKind;
}

const n = (v: number | null | undefined) => v ?? 0;

export function totalCost(c: Pick<FinancialInput, "purchase_price_cents" | "purchase_shipping_cents">): number {
  return c.purchase_price_cents + n(c.purchase_shipping_cents);
}

export function applicablePrice(c: Pick<FinancialInput, "status" | "final_price_cents" | "expected_price_cents">): number | null {
  return c.status === "sold" ? c.final_price_cents : c.expected_price_cents;
}

/** Taxas calculadas = base × % / 100 + taxa fixa, arredondado ao cêntimo (meio para cima). */
export function calcFees(
  price: number,
  feePercent: number | null | undefined,
  feeFixedCents: number | null | undefined,
): number {
  const basisPoints = Math.round(n(feePercent) * 100); // 12,8 % → 1280
  const pct = Math.round((price * basisPoints) / 10000);
  return pct + n(feeFixedCents);
}

export function computeCard(c: FinancialInput): Computed {
  const cost = totalCost(c);
  const price = applicablePrice(c);
  const saleShipping = n(c.sale_shipping_cents);
  const buyerShipping = n(c.buyer_shipping_cents);
  const packaging = n(c.packaging_cents);
  const profitKind: ProfitKind = price == null ? "none" : c.status === "sold" ? "realized" : "estimated";

  if (price == null) {
    return {
      totalCost: cost,
      applicablePrice: null,
      buyerShipping,
      totalPaid: null,
      feeBase: null,
      fees: null,
      feesAreManual: c.fee_actual_cents != null,
      saleShipping,
      packaging,
      profit: null,
      margin: null,
      profitKind,
    };
  }

  const totalPaid = price + buyerShipping;
  const feeBase = c.fee_on_shipping ? totalPaid : price;
  const manual = c.fee_actual_cents != null;
  const fees = manual ? (c.fee_actual_cents as number) : calcFees(feeBase, c.fee_percent, c.fee_fixed_cents);
  // Lucro = preço + portes cobrados − custo real do envio − embalagem − taxas − custo total de compra
  const profit = totalPaid - fees - saleShipping - packaging - cost;
  const margin = cost === 0 ? null : (profit / cost) * 100;

  return { totalCost: cost, applicablePrice: price, buyerShipping, totalPaid, feeBase, fees, feesAreManual: manual, saleShipping, packaging, profit, margin, profitKind };
}

/** Margem global a partir de totais (nunca média de margens). */
export function marginFromTotals(profit: number, cost: number): number | null {
  return cost === 0 ? null : (profit / cost) * 100;
}
