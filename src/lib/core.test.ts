import { describe, expect, it } from "vitest";
import { computeCard, calcFees } from "./calc";
import { parseMoney, formatEUR, formatSignedEUR, formatPercent, centsToInput, formatDate } from "./money";
import { EMPTY_FILTERS, applyQuery, normalize, type Filters } from "./search";
import { summarize } from "./summary";
import type { CardRow } from "./types";
import { cardToInput, emptyInput, inputToFinancials, validateCardInput } from "./card-input";

function card(over: Partial<CardRow> = {}): CardRow {
  return {
    id: "1", user_id: "u", ref: "C-0001", name: "Carta", set_name: null, card_number: null, category: null,
    language: null, condition: null, grading_company: null, grading_grade: null, notes: null,
    front_path: null, back_path: null, purchase_source: null, purchase_date: null,
    purchase_price_cents: 0, purchase_shipping_cents: null, status: "collection", sale_platform: null,
    expected_price_cents: null, final_price_cents: null, sale_date: null, sale_shipping_cents: null,
    packaging_cents: null, buyer_shipping_cents: 0, fee_on_shipping: false, fee_percent: null, fee_fixed_cents: null, fee_actual_cents: null,
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

describe("portes cobrados ao comprador", () => {
  const base = { status: "sold" as const, sale_date: "2026-02-01" };

  it("exemplo do pedido: compra 2,25 €, venda 3 €, portes cobrados 1,50 €, custo real 1,50 € → total pago 4,50 €, lucro 0,75 €", () => {
    const k = computeCard(card({ ...base, purchase_price_cents: 225, final_price_cents: 300, buyer_shipping_cents: 150, sale_shipping_cents: 150, packaging_cents: 0, fee_actual_cents: 0 }));
    expect(k.totalPaid).toBe(450);
    expect(k.profit).toBe(75);
    expect(k.profitKind).toBe("realized");
    expect(k.margin).toBeCloseTo(33.33, 1);
  });
  it("com taxas e embalagem em branco (não só 0) dá o mesmo resultado", () => {
    const k = computeCard(card({ ...base, purchase_price_cents: 225, final_price_cents: 300, buyer_shipping_cents: 150, sale_shipping_cents: 150 }));
    expect(k.totalPaid).toBe(450);
    expect(k.profit).toBe(75);
  });
  it("portes grátis para o comprador: o custo real do envio é despesa minha", () => {
    const k = computeCard(card({ ...base, purchase_price_cents: 225, final_price_cents: 300, buyer_shipping_cents: 0, sale_shipping_cents: 150 }));
    expect(k.totalPaid).toBe(300);
    expect(k.profit).toBe(300 - 150 - 225); // −0,75 €
    expect(k.profit).toBe(-75);
  });
  it("portes cobrados diferentes do custo real: cobrar mais dá ganho, cobrar menos dá perda", () => {
    const mk = (buyer: number, real: number) => computeCard(card({ ...base, purchase_price_cents: 225, final_price_cents: 300, buyer_shipping_cents: buyer, sale_shipping_cents: real }));
    expect(mk(200, 150).profit).toBe(300 + 200 - 150 - 225); // +1,25 €
    expect(mk(100, 150).profit).toBe(300 + 100 - 150 - 225); // +0,25 €
    expect(mk(200, 150).totalPaid).toBe(500);
    expect(mk(100, 150).totalPaid).toBe(400);
  });
  it("cobrado ao comprador mas custo real em branco (ex.: mão em mão): conta como 0 de custo", () => {
    const k = computeCard(card({ ...base, purchase_price_cents: 225, final_price_cents: 300, buyer_shipping_cents: 150 }));
    expect(k.profit).toBe(300 + 150 - 225);
  });
  it("taxa por defeito incide só sobre o preço da carta (comportamento anterior)", () => {
    const k = computeCard(card({ ...base, purchase_price_cents: 225, final_price_cents: 1000, buyer_shipping_cents: 500, fee_percent: 10, fee_fixed_cents: 30 }));
    expect(k.feeBase).toBe(1000);
    expect(k.fees).toBe(130); // 10 % de 10,00 + 0,30
  });
  it("taxa opcionalmente sobre preço + portes cobrados", () => {
    const k = computeCard(card({ ...base, purchase_price_cents: 225, final_price_cents: 1000, buyer_shipping_cents: 500, fee_percent: 10, fee_fixed_cents: 30, fee_on_shipping: true }));
    expect(k.feeBase).toBe(1500);
    expect(k.fees).toBe(180); // 10 % de 15,00 + 0,30
    expect(k.profit).toBe(1500 - 180 - 225);
  });
  it("com portes grátis a opção 'taxa sobre portes' não muda nada", () => {
    const a = computeCard(card({ ...base, purchase_price_cents: 225, final_price_cents: 1000, fee_percent: 10 }));
    const b = computeCard(card({ ...base, purchase_price_cents: 225, final_price_cents: 1000, fee_percent: 10, fee_on_shipping: true }));
    expect(b.fees).toBe(a.fees);
    expect(b.profit).toBe(a.profit);
  });
  it("taxa efetiva manual prevalece, incluindo 0, mesmo com 'taxa sobre portes'", () => {
    const k = computeCard(card({ ...base, purchase_price_cents: 225, final_price_cents: 1000, buyer_shipping_cents: 500, fee_percent: 10, fee_on_shipping: true, fee_actual_cents: 0 }));
    expect(k.fees).toBe(0);
    expect(k.profit).toBe(1500 - 225);
    const k2 = computeCard(card({ ...base, purchase_price_cents: 225, final_price_cents: 1000, buyer_shipping_cents: 500, fee_percent: 10, fee_on_shipping: true, fee_actual_cents: 99 }));
    expect(k2.fees).toBe(99);
  });
  it("total pago ≠ valor líquido após taxas", () => {
    const k = computeCard(card({ ...base, purchase_price_cents: 0, final_price_cents: 1000, buyer_shipping_cents: 300, fee_actual_cents: 200 }));
    expect(k.totalPaid).toBe(1300);
    expect(k.totalPaid! - k.fees!).toBe(1100); // líquido de taxas: outro valor
    expect(k.totalPaid).not.toBe(k.totalPaid! - k.fees!);
  });
  it("estimativas: mesma lógica com preço previsto, identificadas como estimadas", () => {
    const k = computeCard(card({ purchase_price_cents: 225, status: "for_sale", expected_price_cents: 300, buyer_shipping_cents: 150, sale_shipping_cents: 150 }));
    expect(k.totalPaid).toBe(450);
    expect(k.profit).toBe(75);
    expect(k.profitKind).toBe("estimated");
  });
  it("sem preço previsto continua 'Sem estimativa', mesmo com portes registados", () => {
    const k = computeCard(card({ purchase_price_cents: 225, status: "for_sale", buyer_shipping_cents: 150, sale_shipping_cents: 150 }));
    expect(k.profit).toBeNull();
    expect(k.totalPaid).toBeNull();
    expect(k.profitKind).toBe("none");
  });
  it("registos anteriores à alteração (campos novos em falta ou a zero) dão exatamente o lucro antigo", () => {
    const legacy = { ...card({ ...base, purchase_price_cents: 12000, purchase_shipping_cents: 350, final_price_cents: 14500, fee_actual_cents: 725, sale_shipping_cents: 250, packaging_cents: 50 }) } as Partial<CardRow>;
    delete legacy.buyer_shipping_cents; // como se a linha viesse de antes da migração
    delete legacy.fee_on_shipping;
    const k = computeCard(legacy as CardRow);
    expect(k.profit).toBe(1125); // = lucro de 11,25 € do exemplo original
    expect(k.totalCost).toBe(12350);
    expect(k.buyerShipping).toBe(0);
    expect(k.totalPaid).toBe(14500);
    const migrated = computeCard({ ...(legacy as CardRow), buyer_shipping_cents: 0, fee_on_shipping: false });
    expect(migrated).toEqual(k);
  });
  it("registos antigos com taxa percentual: sem alteração de taxas nem de lucro", () => {
    const k = computeCard(card({ ...base, purchase_price_cents: 1000, final_price_cents: 2000, fee_percent: 5, sale_shipping_cents: 300 }));
    expect(k.fees).toBe(100);
    expect(k.profit).toBe(2000 - 100 - 300 - 1000);
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
  it("distingue receita das cartas, portes cobrados e total recebido, sem contar nada duas vezes", () => {
    const cards = [
      card({ id: "1", status: "sold", purchase_price_cents: 225, final_price_cents: 300, sale_date: "2026-02-01", buyer_shipping_cents: 150, sale_shipping_cents: 150, fee_actual_cents: 0 }),
      card({ id: "2", status: "sold", purchase_price_cents: 1000, final_price_cents: 2000, sale_date: "2026-02-02", buyer_shipping_cents: 0, sale_shipping_cents: 200, fee_actual_cents: 100 }),
      card({ id: "3", status: "for_sale", purchase_price_cents: 500, expected_price_cents: 1500, buyer_shipping_cents: 120, sale_shipping_cents: 120 }),
    ];
    const s = summarize(cards);
    expect(s.revenue).toBe(2300);          // só preço das cartas
    expect(s.buyerShipping).toBe(150);     // só portes cobrados (vendidas)
    expect(s.totalReceived).toBe(2450);    // receita + portes, uma vez cada
    expect(s.totalReceived).toBe(s.revenue + s.buyerShipping);
    expect(s.saleShipping).toBe(350);      // custo real do envio
    expect(s.fees).toBe(100);
    expect(s.realizedProfit).toBe(75 + (2000 - 100 - 200 - 1000)); // 75 + 700
    // lucro = total recebido − taxas − envio − embalagem − custo das vendidas
    expect(s.realizedProfit).toBe(s.totalReceived - s.fees - s.saleShipping - s.packaging - s.soldCost);
    expect(s.forSale.expectedValue).toBe(1500);
    expect(s.forSale.expectedBuyerShipping).toBe(120);
    expect(s.forSale.estimatedProfit).toBe(1500 + 120 - 120 - 500);
    // estimativas não entram no "recebido"
    expect(s.totalReceived).toBe(2450);
  });
  it("coleção vazia não rebenta", () => {
    const s = summarize([]);
    expect(s.realizedMargin).toBeNull();
    expect(s.count).toBe(0);
  });
});

describe("formulário: portes cobrados", () => {
  const base = () => ({ ...emptyInput("00000000-0000-0000-0000-000000000001"), name: "X", purchase_price: "2,25" });
  it("exemplo completo via texto PT: total pago 4,50 € e lucro 0,75 €", () => {
    const v = { ...base(), status: "sold" as const, final_price: "3", sale_date: "2026-02-01", buyer_shipping: "1,50", sale_shipping: "1,50", packaging: "0", fee_actual: "0" };
    const r = validateCardInput(v);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.buyer_shipping_cents).toBe(150);
    expect(r.value.sale_shipping_cents).toBe(150);
    const k = computeCard(inputToFinancials(v));
    expect(k.totalPaid).toBe(450);
    expect(k.profit).toBe(75);
  });
  it("em branco = portes grátis (0), não erro", () => {
    const r = validateCardInput(base());
    expect(r.ok && r.value.buyer_shipping_cents).toBe(0);
    expect(r.ok && r.value.fee_on_shipping).toBe(false);
  });
  it("rejeita valor negativo ou inválido", () => {
    expect(validateCardInput({ ...base(), buyer_shipping: "-1" }).ok).toBe(false);
    expect(validateCardInput({ ...base(), buyer_shipping: "abc" }).ok).toBe(false);
  });
  it("ida e volta cartão ↔ formulário preserva os portes", () => {
    const c = card({ buyer_shipping_cents: 150, sale_shipping_cents: 175, fee_on_shipping: true });
    const i = cardToInput(c);
    expect(i.buyer_shipping).toBe("1,50");
    expect(i.sale_shipping).toBe("1,75");
    expect(i.fee_on_shipping).toBe(true);
    const old = cardToInput(card({ buyer_shipping_cents: 0 }));
    expect(old.buyer_shipping).toBe("");
  });
});
