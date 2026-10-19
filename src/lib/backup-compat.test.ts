import { describe, expect, it } from "vitest";
// @ts-expect-error — módulo .mjs partilhado com scripts/restore.mjs (sem tipos)
import { upgradeBackup } from "../../scripts/backup-compat.mjs";
import { computeCard } from "./calc";
import type { CardRow } from "./types";

const v1 = {
  format: "minha-colecao-backup",
  version: 1,
  exportedAt: "2026-10-18T12:00:00Z",
  appName: "A Minha Coleção",
  cards: [
    { id: "a", ref: "C-0001", name: "Antiga", status: "sold", purchase_price_cents: 12000, purchase_shipping_cents: 350, final_price_cents: 14500, sale_date: "2026-02-01", sale_shipping_cents: 250, packaging_cents: 50, fee_actual_cents: 725, expected_price_cents: null, fee_percent: null, fee_fixed_cents: null },
  ],
  options: [{ id: "o", kind: "platform", label: "eBay", fee_percent: 5, fee_fixed_cents: 0 }],
};

describe("compatibilidade de backups", () => {
  it("backup v1 é atualizado para v2 com portes cobrados = 0 e sem 'taxa sobre portes'", () => {
    const up = upgradeBackup(v1);
    expect(up.version).toBe(2);
    expect(up.cards[0].buyer_shipping_cents).toBe(0);
    expect(up.cards[0].fee_on_shipping).toBe(false);
    expect(up.options[0].fee_on_shipping).toBe(false);
  });
  it("preserva o antigo 'portes de venda' como custo real do envio e o lucro antigo (11,25 €)", () => {
    const up = upgradeBackup(v1);
    expect(up.cards[0].sale_shipping_cents).toBe(250);
    const k = computeCard(up.cards[0] as CardRow);
    expect(k.profit).toBe(1125);
  });
  it("não altera o original", () => {
    upgradeBackup(v1);
    expect((v1.cards[0] as Record<string, unknown>).buyer_shipping_cents).toBeUndefined();
  });
  it("backup v2 mantém os valores guardados", () => {
    const v2 = { ...v1, version: 2, cards: [{ ...v1.cards[0], buyer_shipping_cents: 150, fee_on_shipping: true }], options: [{ ...v1.options[0], fee_on_shipping: true }] };
    const up = upgradeBackup(v2);
    expect(up.cards[0].buyer_shipping_cents).toBe(150);
    expect(up.cards[0].fee_on_shipping).toBe(true);
    expect(up.options[0].fee_on_shipping).toBe(true);
  });
  it("rejeita formatos e versões desconhecidos", () => {
    expect(() => upgradeBackup({ format: "outro", version: 1, cards: [], options: [] })).toThrow();
    expect(() => upgradeBackup({ ...v1, version: 99 })).toThrow(/não suportada/);
  });
});
