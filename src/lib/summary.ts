import { computeCard, marginFromTotals } from "./calc";
import type { CardRow } from "./types";

export interface Summary {
  count: number;
  countCollection: number;
  countForSale: number;
  countSold: number;

  totalPurchases: number;
  totalPurchaseShipping: number;
  totalCost: number;
  unsoldCost: number;

  // Realizado (cartas vendidas)
  revenue: number;
  soldCost: number;
  fees: number;
  saleShippingAndPackaging: number;
  saleShipping: number;
  packaging: number;
  realizedProfit: number;
  realizedMargin: number | null;

  // Estimado (cartas não vendidas)
  forSale: EstimateBlock;
  inCollection: EstimateBlock;
  noEstimateCount: number;

  /** "Realizado + estimado" — nunca apresentar como dinheiro já ganho. */
  totalProfitMixed: number;
}

export interface EstimateBlock {
  count: number;
  withEstimate: number;
  expectedValue: number;
  estimatedProfit: number;
}

const emptyBlock = (): EstimateBlock => ({ count: 0, withEstimate: 0, expectedValue: 0, estimatedProfit: 0 });

export function summarize(cards: CardRow[]): Summary {
  const s: Summary = {
    count: cards.length,
    countCollection: 0,
    countForSale: 0,
    countSold: 0,
    totalPurchases: 0,
    totalPurchaseShipping: 0,
    totalCost: 0,
    unsoldCost: 0,
    revenue: 0,
    soldCost: 0,
    fees: 0,
    saleShippingAndPackaging: 0,
    saleShipping: 0,
    packaging: 0,
    realizedProfit: 0,
    realizedMargin: null,
    forSale: emptyBlock(),
    inCollection: emptyBlock(),
    noEstimateCount: 0,
    totalProfitMixed: 0,
  };

  for (const c of cards) {
    const k = computeCard(c);
    s.totalPurchases += c.purchase_price_cents;
    s.totalPurchaseShipping += c.purchase_shipping_cents ?? 0;
    s.totalCost += k.totalCost;

    if (c.status === "sold") {
      s.countSold++;
      if (k.applicablePrice != null) {
        s.revenue += k.applicablePrice;
        s.fees += k.fees ?? 0;
        s.saleShipping += k.saleShipping;
        s.packaging += k.packaging;
        s.soldCost += k.totalCost;
        s.realizedProfit += k.profit ?? 0;
      }
      continue;
    }

    s.unsoldCost += k.totalCost;
    const block = c.status === "for_sale" ? s.forSale : s.inCollection;
    if (c.status === "for_sale") s.countForSale++;
    else s.countCollection++;
    block.count++;
    if (k.applicablePrice == null) {
      s.noEstimateCount++;
    } else {
      block.withEstimate++;
      block.expectedValue += k.applicablePrice;
      block.estimatedProfit += k.profit ?? 0;
    }
  }

  s.saleShippingAndPackaging = s.saleShipping + s.packaging;
  s.realizedMargin = marginFromTotals(s.realizedProfit, s.soldCost);
  s.totalProfitMixed = s.realizedProfit + s.forSale.estimatedProfit + s.inCollection.estimatedProfit;
  return s;
}
