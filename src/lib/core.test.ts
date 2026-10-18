import { describe, expect, it } from "vitest";
import { computeCard, calcFees } from "./calc";
import { parseMoney, formatEUR, formatSignedEUR, formatPercent, centsToInput, formatDate } from "./money";
import { EMPTY_FILTERS, applyQuery, normalize, type Filters } from "./search";
import { summarize } from "./summary";
import type { CardRow } from "./types";

function card(over: Partial<CardRow> = {}): CardRow {
  return {
    id: "1", user_id: "u", ref: "C-0001", name: "Carta", set_name: null, card_number: null, category: null,
    language: null, condition: null, grading_company: null, grading_grade: null, notes: null,
    front_path: null, back_path: null, purchase_source: null, purchase_date: null,
    purchase_price_cents: 0, purchase_shipping_cents: null, status: "collection", sale_platform: null,
    expected_price_cents: null, final_price_cents: null, sale_date: null, sale_shipping_cents: null,
    packaging_cents: null, fee_percent: null, fee_fixed_cents: null, fee_actual_cents: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over,
  };
}

describe("dinheiro", () => {
  it("interpreta formatos portugueses", () => {
    const ok = (s: string) => (parseMoney(s) as { ok: true; cents: number | null }).cents;
    expect(ok("12,50")).toBe(1250);
    expect(ok("12.50")).toBe(1250);
    expect(ok("1.234,56")).toBe(123456);
    expect(ok("1,234.56")).toBe(123456);
    expect(ok("1.234")).toBe(123400);
    expect(ok("12")).toBe(1200);
    expect(ok("0")).toBe(0);
    expect(ok("0,1")).toBe(10);
    expect(ok(" 12,5 € ")).toBe(1250);
    expect(ok("")).toBeNull();
    expect(ok("   ")).toBeNull();
  });
  it("distingue em branco de zero", () => {
    expect(parseMoney("")).toEqual({ ok: true, cents: null });
    expect(parseMoney("0,00")).toEqual({ ok: true, cents: 0 });
  });
  it("rejeita valores inválidos", () => {
    for (const s of ["abc", "-5", "12,345", "1,2,3", "12,5x"]) expect(parseMoney(s).ok).toBe(false);
  });
  it("evita erros de vírgula flutuante", () => {
    expect((parseMoney("0,29") as { cents: number }).cents).toBe(29);
    expect((parseMoney("1,15") as { cents: number }).cents).toBe(115);
    expect((parseMoney("4,35") as { cents: number }).cents).toBe(435);
  });
  it("formata", () => {
    expect(formatEUR(12350).replace(/\s/g, " ")).toBe("123,50 €");
    expect(formatSignedEUR(1125)).toContain("+");
    expect(formatSignedEUR(-500)).toContain("−");
    expect(formatEUR(null)).toBe("—");
    expect(formatPercent(9.109)).toBe("+9,1 %");
    expect(centsToInput(350)).toBe("3,50");
    expect(centsToInput(0)).toBe("0,00");
    expect(centsToInput(null)).toBe("");
    expect(formatDate("2026-03-09")).toBe("09/03/2026");
  });
});

describe("cálculos", () => {
  const exemplo = card({
    status: "sold", purchase_price_cents: 12000, purchase_shipping_cents: 350,
    final_price_cents: 14500, sale_date: "2026-02-01", fee_actual_cents: 725,
    sale_shipping_cents: 250, packaging_cents: 50,
  });
  it("exemplo do PDF: custo 123,50, lucro 11,25, margem ≈ 9,1 %", () => {
    const k = computeCard(exemplo);
    expect(k.totalCost).toBe(12350);
    expect(k.profit).toBe(1125);
    expect(k.margin).toBeCloseTo(9.109, 2);
    expect(k.profitKind).toBe("realized");
  });
  it("taxa calculada 5 % de 145 € = 7,25 €", () => {
    expect(calcFees(14500, 5, null)).toBe(725);
    const k = computeCard({ ...exemplo, fee_actual_cents: null, fee_percent: 5 });
    expect(k.fees).toBe(725);
    expect(k.profit).toBe(1125);
  });
  it("taxa percentual + fixa e arredondamento ao cêntimo", () => {
    expect(calcFees(1000, 12.8, 30)).toBe(158); // 128 + 30
    expect(calcFees(333, 5, null)).toBe(17); // 16,65 → 17
  });
  it("taxa manual prevalece, incluindo zero", () => {
    const k = computeCard({ ...exemplo, fee_percent: 5, fee_fixed_cents: 100, fee_actual_cents: 0 });
    expect(k.fees).toBe(0);
    expect(k.profit).toBe(14500 - 0 - 250 - 50 - 12350);
  });
  it("sem preço previsto: sem estimativa, nunca prejuízo artificial", () => {
    const k = computeCard(card({ purchase_price_cents: 5000, status: "for_sale" }));
    expect(k.profit).toBeNull();
    expect(k.margin).toBeNull();
    expect(k.profitKind).toBe("none");
    expect(k.applicablePrice).toBeNull();
  });
  it("preço previsto 0 é diferente de em branco", () => {
    const k = computeCard(card({ purchase_price_cents: 500, status: "for_sale", expected_price_cents: 0 }));
    expect(k.profit).toBe(-500);
    expect(k.profitKind).toBe("estimated");
  });
  it("não vendida usa o preço previsto (Estimado); vendida usa o final (Realizado)", () => {
    const a = computeCard(card({ purchase_price_cents: 1000, status: "for_sale", expected_price_cents: 2000, final_price_cents: 9999 }));
    expect(a.applicablePrice).toBe(2000);
    expect(a.profitKind).toBe("estimated");
    const b = computeCard(card({ purchase_price_cents: 1000, status: "sold", expected_price_cents: 2000, final_price_cents: 1500 }));
    expect(b.applicablePrice).toBe(1500);
    expect(b.profitKind).toBe("realized");
  });
  it("custo zero: margem indefinida", () => {
    const k = computeCard(card({ purchase_price_cents: 0, status: "for_sale", expected_price_cents: 1000 }));
    expect(k.profit).toBe(1000);
    expect(k.margin).toBeNull();
  });
  it("lucro negativo", () => {
    const k = computeCard(card({ purchase_price_cents: 5000, status: "sold", final_price_cents: 3000, sale_date: "2026-01-01" }));
    expect(k.profit).toBe(-2000);
    expect(k.margin).toBeCloseTo(-40);
  });
});

describe("pesquisa e filtros", () => {
  const cards: CardRow[] = [
    card({ id: "a", ref: "C-0001", name: "Charizard", set_name: "Base Set", condition: "Near Mint (NM)", status: "for_sale", purchase_source: "Cardmarket", purchase_price_cents: 4000 }),
    card({ id: "b", ref: "C-0002", name: "Pikachu", set_name: "Jungle", condition: "Excellent (EX)", status: "collection", purchase_source: "Vinted", purchase_price_cents: 500 }),
    card({ id: "c", ref: "C-0003", name: "Évoli ✨", set_name: "Base Set", condition: "Near Mint (NM)", status: "sold", purchase_source: "Cardmarket", purchase_price_cents: 6000, final_price_cents: 9000, sale_date: "2026-05-10", sale_platform: "Cardmarket", notes: "Edição especial" }),
    card({ id: "d", ref: "C-0010", name: "Blastoise", set_name: "Base Set", condition: "Played (PL)", status: "sold", purchase_source: "eBay", purchase_price_cents: 3000, final_price_cents: 2000, sale_date: "2026-06-01", sale_platform: "eBay" }),
  ];
  const q = (f: Partial<Filters>) => applyQuery(cards, { ...EMPTY_FILTERS, ...f }, { key: "ref", dir: "asc" }).map((c) => c.id);

  it("normaliza acentos e maiúsculas", () => {
    expect(normalize("  Édição  ")).toBe("edicao");
    expect(q({ q: "CHARIZARD" })).toEqual(["a"]);
    expect(q({ q: "evoli" })).toEqual(["c"]);
    expect(q({ q: "edicao especial" })).toEqual(["c"]);
  });
  it("referência 001 (pesquisa por parte da referência)", () => {
    expect(q({ q: "001", field: "ref" })).toEqual(["a", "d"]); // C-0001 e C-0010 contêm "001"
    expect(q({ q: "c-0001" })).toEqual(["a"]);
  });
  it("pesquisa por campo específico", () => {
    expect(q({ q: "jungle", field: "name" })).toEqual([]);
    expect(q({ q: "jungle", field: "set_name" })).toEqual(["b"]);
  });
  it("Base Set + Near Mint + À venda", () => {
    expect(q({ sets: ["Base Set"], conditions: ["Near Mint (NM)"], statuses: ["for_sale"] })).toEqual(["a"]);
  });
  it("OU dentro do mesmo filtro, E entre filtros", () => {
    expect(q({ sources: ["Cardmarket", "eBay"] })).toEqual(["a", "c", "d"]);
    expect(q({ sources: ["Cardmarket", "eBay"], statuses: ["sold"] })).toEqual(["c", "d"]);
  });
  it("Cardmarket abaixo de 50 €", () => {
    expect(q({ sources: ["Cardmarket"], purchasePriceMax: 4999 })).toEqual(["a"]);
  });
  it("vendidas num intervalo com lucro positivo", () => {
    expect(q({ statuses: ["sold"], saleFrom: "2026-05-01", saleTo: "2026-06-30", profitSign: "positive" })).toEqual(["c"]);
    expect(q({ statuses: ["sold"], profitSign: "negative" })).toEqual(["d"]);
  });
  it("intervalo de valor exclui cartas sem estimativa", () => {
    expect(q({ saleMin: 0 })).toEqual(["c", "d"]);
  });
  it("ordenação coloca vazios no fim", () => {
    const r = applyQuery(cards, EMPTY_FILTERS, { key: "profit", dir: "desc" }).map((c) => c.id);
    expect(r.slice(0, 2)).toEqual(["c", "d"]);
  });
});

describe("resumo", () => {
  it("separa realizado de estimado e calcula margem a partir de totais", () => {
    const cards = [
      card({ id: "1", status: "sold", purchase_price_cents: 12000, purchase_shipping_cents: 350, final_price_cents: 14500, sale_date: "2026-02-01", fee_actual_cents: 725, sale_shipping_cents: 250, packaging_cents: 50 }),
      card({ id: "2", status: "for_sale", purchase_price_cents: 1000, expected_price_cents: 1500 }),
      card({ id: "3", status: "collection", purchase_price_cents: 2000 }),
      card({ id: "4", status: "collection", purchase_price_cents: 500, expected_price_cents: 400 }),
    ];
    const s = summarize(cards);
    expect(s.count).toBe(4);
    expect([s.countCollection, s.countForSale, s.countSold]).toEqual([2, 1, 1]);
    expect(s.totalPurchases).toBe(15500);
    expect(s.totalPurchaseShipping).toBe(350);
    expect(s.totalCost).toBe(15850);
    expect(s.unsoldCost).toBe(3500);
    expect(s.revenue).toBe(14500);
    expect(s.soldCost).toBe(12350);
    expect(s.fees).toBe(725);
    expect(s.saleShippingAndPackaging).toBe(300);
    expect(s.realizedProfit).toBe(1125);
    expect(s.realizedMargin).toBeCloseTo(9.109, 2);
    expect(s.forSale).toMatchObject({ withEstimate: 1, expectedValue: 1500, estimatedProfit: 500 });
    expect(s.inCollection).toMatchObject({ count: 2, withEstimate: 1, expectedValue: 400, estimatedProfit: -100 });
    expect(s.noEstimateCount).toBe(1);
    expect(s.totalProfitMixed).toBe(1125 + 500 - 100);
  });
  it("coleção vazia não rebenta", () => {
    const s = summarize([]);
    expect(s.realizedMargin).toBeNull();
    expect(s.count).toBe(0);
  });
});
