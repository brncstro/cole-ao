/**
 * Compatibilidade de backups. Funções puras (testadas em src/lib/backup-compat.test.ts).
 *
 * v1 (anterior aos portes cobrados): sem `buyer_shipping_cents` nem `fee_on_shipping`.
 * v2: inclui ambos. `sale_shipping_cents` mantém o mesmo nome e passa a significar "custo real do envio".
 */
export const SUPPORTED_VERSIONS = [1, 2];

export function upgradeBackup(data) {
  if (!data || data.format !== "minha-colecao-backup") throw new Error("Ficheiro de backup não reconhecido.");
  if (!SUPPORTED_VERSIONS.includes(data.version)) {
    throw new Error(`Versão de backup ${data.version} não suportada por este script (suporta ${SUPPORTED_VERSIONS.join(", ")}).`);
  }
  return {
    ...data,
    version: 2,
    // Backups v1: portes cobrados = 0 e taxa só sobre o preço da carta (o comportamento anterior);
    // o antigo "portes de venda" fica como custo real do envio, sem alterações.
    cards: data.cards.map((c) => ({
      ...c,
      buyer_shipping_cents: c.buyer_shipping_cents ?? 0,
      fee_on_shipping: c.fee_on_shipping ?? false,
    })),
    options: data.options.map((o) => ({ ...o, fee_on_shipping: o.fee_on_shipping ?? false })),
  };
}
