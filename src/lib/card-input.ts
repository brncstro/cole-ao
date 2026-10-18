import { parseDecimal, parseMoney, centsToInput } from "./money";
import { STATUSES, type CardRow, type Status } from "./types";

/** Estado do formulário: tudo texto (o que o utilizador escreve). */
export interface CardInput {
  id: string;
  name: string;
  set_name: string;
  card_number: string;
  category: string;
  language: string;
  condition: string;
  grading_company: string;
  grading_grade: string;
  notes: string;
  front_path: string;
  back_path: string;
  purchase_source: string;
  purchase_date: string;
  purchase_price: string;
  purchase_shipping: string;
  status: Status;
  sale_platform: string;
  expected_price: string;
  final_price: string;
  sale_date: string;
  sale_shipping: string;
  packaging: string;
  fee_percent: string;
  fee_fixed: string;
  fee_actual: string;
}

export function emptyInput(id: string): CardInput {
  return {
    id, name: "", set_name: "", card_number: "", category: "", language: "", condition: "",
    grading_company: "", grading_grade: "", notes: "", front_path: "", back_path: "",
    purchase_source: "", purchase_date: "", purchase_price: "", purchase_shipping: "",
    status: "collection", sale_platform: "", expected_price: "", final_price: "", sale_date: "",
    sale_shipping: "", packaging: "", fee_percent: "", fee_fixed: "", fee_actual: "",
  };
}

export function cardToInput(c: CardRow): CardInput {
  return {
    id: c.id,
    name: c.name,
    set_name: c.set_name ?? "",
    card_number: c.card_number ?? "",
    category: c.category ?? "",
    language: c.language ?? "",
    condition: c.condition ?? "",
    grading_company: c.grading_company ?? "",
    grading_grade: c.grading_grade ?? "",
    notes: c.notes ?? "",
    front_path: c.front_path ?? "",
    back_path: c.back_path ?? "",
    purchase_source: c.purchase_source ?? "",
    purchase_date: c.purchase_date ?? "",
    purchase_price: centsToInput(c.purchase_price_cents),
    purchase_shipping: centsToInput(c.purchase_shipping_cents),
    status: c.status,
    sale_platform: c.sale_platform ?? "",
    expected_price: centsToInput(c.expected_price_cents),
    final_price: centsToInput(c.final_price_cents),
    sale_date: c.sale_date ?? "",
    sale_shipping: centsToInput(c.sale_shipping_cents),
    packaging: centsToInput(c.packaging_cents),
    fee_percent: c.fee_percent == null ? "" : String(c.fee_percent).replace(".", ","),
    fee_fixed: centsToInput(c.fee_fixed_cents),
    fee_actual: centsToInput(c.fee_actual_cents),
  };
}

/** Valores prontos a gravar (colunas da tabela `cards`, sem id/user_id/ref). */
export type CardPayload = Omit<CardRow, "id" | "user_id" | "ref" | "created_at" | "updated_at">;

export type ValidationResult =
  | { ok: true; value: CardPayload }
  | { ok: false; errors: Record<string, string> };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1900 && y <= 2100;
}

const text = (s: string, max: number, errors: Record<string, string>, key: string, label: string): string | null => {
  const t = (s ?? "").trim();
  if (t.length > max) errors[key] = `${label}: máximo de ${max} caracteres.`;
  return t === "" ? null : t;
};

/**
 * Validação única, usada no cliente (feedback imediato) e no servidor (autoridade).
 * `photoPrefix` — se indicado, os caminhos das fotografias têm de começar por ele.
 */
export function validateCardInput(input: CardInput, photoPrefix?: string): ValidationResult {
  const errors: Record<string, string> = {};

  const name = text(input.name, 200, errors, "name", "Nome");
  if (!name) errors.name = "Indique o nome da carta.";

  const money = (key: keyof CardInput, label: string, required = false): number | null => {
    const r = parseMoney(input[key] as string);
    if (!r.ok) {
      errors[key] = `${label}: ${r.error}`;
      return null;
    }
    if (r.cents == null && required) errors[key] = `${label}: indique um valor (use 0 se for intencional).`;
    return r.cents;
  };

  const purchase = money("purchase_price", "Preço de compra", true) ?? 0;
  const purchaseShipping = money("purchase_shipping", "Portes de compra");
  const expected = money("expected_price", "Preço previsto");
  const final = money("final_price", "Preço final de venda");
  const saleShipping = money("sale_shipping", "Portes de venda");
  const packaging = money("packaging", "Embalagem");
  const feeFixed = money("fee_fixed", "Taxa fixa");
  const feeActual = money("fee_actual", "Taxas efetivas");

  const pct = parseDecimal(input.fee_percent);
  let feePercent: number | null = null;
  if (!pct.ok) errors.fee_percent = `Taxa percentual: ${pct.error}`;
  else feePercent = pct.value;

  if (!STATUSES.includes(input.status)) errors.status = "Situação inválida.";

  const dateField = (key: "purchase_date" | "sale_date", label: string): string | null => {
    const v = (input[key] ?? "").trim();
    if (v === "") return null;
    if (!validDate(v)) {
      errors[key] = `${label}: data inválida.`;
      return null;
    }
    return v;
  };
  const purchaseDate = dateField("purchase_date", "Data da compra");
  let saleDate = dateField("sale_date", "Data da venda");

  const sold = input.status === "sold";
  if (sold) {
    if (final == null && !errors.final_price) errors.final_price = "Indique o preço final para marcar como vendida.";
    if (!saleDate && !errors.sale_date) errors.sale_date = "Indique a data da venda para marcar como vendida.";
  }

  const front = (input.front_path ?? "").trim() || null;
  const back = (input.back_path ?? "").trim() || null;
  if (photoPrefix) {
    if (front && !front.startsWith(photoPrefix)) errors.front_path = "Fotografia inválida.";
    if (back && !back.startsWith(photoPrefix)) errors.back_path = "Fotografia inválida.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  if (!sold) saleDate = null;

  return {
    ok: true,
    value: {
      name: name!,
      set_name: text(input.set_name, 120, errors, "set_name", "Coleção"),
      card_number: text(input.card_number, 40, errors, "card_number", "Número"),
      category: text(input.category, 80, errors, "category", "Categoria"),
      language: text(input.language, 40, errors, "language", "Idioma"),
      condition: text(input.condition, 80, errors, "condition", "Conservação"),
      grading_company: text(input.grading_company, 40, errors, "grading_company", "Empresa de graduação"),
      grading_grade: text(input.grading_grade, 20, errors, "grading_grade", "Nota"),
      notes: text(input.notes, 4000, errors, "notes", "Notas"),
      front_path: front,
      back_path: back,
      purchase_source: text(input.purchase_source, 80, errors, "purchase_source", "Origem"),
      purchase_date: purchaseDate,
      purchase_price_cents: purchase,
      purchase_shipping_cents: purchaseShipping,
      status: input.status,
      sale_platform: text(input.sale_platform, 80, errors, "sale_platform", "Plataforma"),
      expected_price_cents: expected,
      // O preço final, a data e as taxas efetivas só fazem sentido numa carta vendida.
      final_price_cents: sold ? final : null,
      sale_date: saleDate,
      sale_shipping_cents: saleShipping,
      packaging_cents: packaging,
      fee_percent: feePercent,
      fee_fixed_cents: feeFixed,
      fee_actual_cents: sold ? feeActual : null,
    },
  };
}

/** Converte o estado do formulário numa linha parcial para cálculos em tempo real (pré-visualização). */
export function inputToFinancials(input: CardInput) {
  const m = (s: string) => {
    const r = parseMoney(s);
    return r.ok ? r.cents : null;
  };
  const pct = parseDecimal(input.fee_percent);
  const sold = input.status === "sold";
  return {
    status: input.status,
    purchase_price_cents: m(input.purchase_price) ?? 0,
    purchase_shipping_cents: m(input.purchase_shipping),
    expected_price_cents: m(input.expected_price),
    final_price_cents: sold ? m(input.final_price) : null,
    sale_shipping_cents: m(input.sale_shipping),
    packaging_cents: m(input.packaging),
    fee_percent: pct.ok ? pct.value : null,
    fee_fixed_cents: m(input.fee_fixed),
    fee_actual_cents: sold ? m(input.fee_actual) : null,
  };
}
