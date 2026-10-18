export type Status = "collection" | "for_sale" | "sold";

export const STATUS_LABEL: Record<Status, string> = {
  collection: "Em coleção",
  for_sale: "À venda",
  sold: "Vendida",
};

export const STATUSES: Status[] = ["collection", "for_sale", "sold"];

/** Linha da tabela `cards`. Todos os valores monetários são inteiros em cêntimos. */
export interface CardRow {
  id: string;
  user_id: string;
  ref: string;
  name: string;
  set_name: string | null;
  card_number: string | null;
  category: string | null;
  language: string | null;
  condition: string | null;
  grading_company: string | null;
  grading_grade: string | null;
  notes: string | null;
  front_path: string | null;
  back_path: string | null;
  purchase_source: string | null;
  purchase_date: string | null; // YYYY-MM-DD
  purchase_price_cents: number;
  purchase_shipping_cents: number | null;
  status: Status;
  sale_platform: string | null;
  expected_price_cents: number | null;
  final_price_cents: number | null;
  sale_date: string | null; // YYYY-MM-DD
  sale_shipping_cents: number | null;
  packaging_cents: number | null;
  fee_percent: number | null;
  fee_fixed_cents: number | null;
  fee_actual_cents: number | null; // valor efetivamente cobrado; 0 prevalece
  created_at: string;
  updated_at: string;
}

export type OptionKind = "set" | "category" | "condition" | "source" | "platform";

export const OPTION_KIND_LABEL: Record<OptionKind, string> = {
  set: "Coleções / edições",
  category: "Categorias / jogos",
  condition: "Estados de conservação",
  source: "Origens de compra",
  platform: "Plataformas de venda",
};

export interface OptionRow {
  id: string;
  user_id: string;
  kind: OptionKind;
  label: string;
  fee_percent: number | null;
  fee_fixed_cents: number | null;
  fee_is_example: boolean;
  sort_order: number;
}

export interface ProfileRow {
  user_id: string;
  app_name: string;
  next_ref: number;
}

export type ProfitKind = "realized" | "estimated" | "none";

export const PROFIT_KIND_LABEL: Record<ProfitKind, string> = {
  realized: "Realizado",
  estimated: "Estimado",
  none: "Sem estimativa",
};
