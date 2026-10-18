import { computeCard } from "./calc";
import { STATUS_LABEL, type CardRow, type Status } from "./types";

/** Minúsculas e sem acentos: "Edição" → "edicao". */
export function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export type SearchField =
  | "all"
  | "name"
  | "ref"
  | "set_name"
  | "card_number"
  | "category"
  | "language"
  | "condition"
  | "grading"
  | "purchase_source"
  | "sale_platform"
  | "notes";

export const SEARCH_FIELD_LABEL: Record<SearchField, string> = {
  all: "Todos os campos",
  name: "Nome",
  ref: "Referência",
  set_name: "Coleção / edição",
  card_number: "Número",
  category: "Categoria",
  language: "Idioma",
  condition: "Conservação",
  grading: "Graduação",
  purchase_source: "Onde comprou",
  sale_platform: "Plataforma de venda",
  notes: "Notas",
};

export interface Filters {
  q: string;
  field: SearchField;
  sets: string[];
  categories: string[];
  conditions: string[];
  statuses: Status[];
  sources: string[];
  platforms: string[];
  purchaseFrom: string; // YYYY-MM-DD
  purchaseTo: string;
  saleFrom: string;
  saleTo: string;
  costMin: number | null; // cêntimos
  costMax: number | null;
  saleMin: number | null; // preço de venda aplicável
  saleMax: number | null;
  purchasePriceMin: number | null;
  purchasePriceMax: number | null;
  profitSign: "any" | "positive" | "negative";
}

export const EMPTY_FILTERS: Filters = {
  q: "",
  field: "all",
  sets: [],
  categories: [],
  conditions: [],
  statuses: [],
  sources: [],
  platforms: [],
  purchaseFrom: "",
  purchaseTo: "",
  saleFrom: "",
  saleTo: "",
  costMin: null,
  costMax: null,
  saleMin: null,
  saleMax: null,
  purchasePriceMin: null,
  purchasePriceMax: null,
  profitSign: "any",
};

function haystack(c: CardRow, field: SearchField): string {
  switch (field) {
    case "all":
      return normalize(
        [
          c.name, c.ref, c.set_name, c.card_number, c.category, c.language, c.condition,
          c.grading_company, c.grading_grade, c.purchase_source, c.sale_platform, c.notes,
          STATUS_LABEL[c.status],
        ].join(" \u0001 "),
      );
    case "grading":
      return normalize(`${c.grading_company ?? ""} ${c.grading_grade ?? ""}`);
    default:
      return normalize(c[field] as string | null);
  }
}

const inList = (list: string[], v: string | null) => list.length === 0 || (v != null && list.includes(v));

/**
 * Filtros de campos diferentes combinam-se com E; várias opções no mesmo filtro com OU.
 * Na pesquisa de texto, todas as palavras têm de existir (E).
 */
export function matchesFilters(c: CardRow, f: Filters): boolean {
  const tokens = normalize(f.q).split(/\s+/).filter(Boolean);
  if (tokens.length) {
    const h = haystack(c, f.field);
    if (!tokens.every((t) => h.includes(t))) return false;
  }
  if (!inList(f.sets, c.set_name)) return false;
  if (!inList(f.categories, c.category)) return false;
  if (!inList(f.conditions, c.condition)) return false;
  if (f.statuses.length && !f.statuses.includes(c.status)) return false;
  if (!inList(f.sources, c.purchase_source)) return false;
  if (!inList(f.platforms, c.sale_platform)) return false;

  if (f.purchaseFrom && (!c.purchase_date || c.purchase_date < f.purchaseFrom)) return false;
  if (f.purchaseTo && (!c.purchase_date || c.purchase_date > f.purchaseTo)) return false;
  if (f.saleFrom && (!c.sale_date || c.sale_date < f.saleFrom)) return false;
  if (f.saleTo && (!c.sale_date || c.sale_date > f.saleTo)) return false;

  const k = computeCard(c);
  if (f.purchasePriceMin != null && c.purchase_price_cents < f.purchasePriceMin) return false;
  if (f.purchasePriceMax != null && c.purchase_price_cents > f.purchasePriceMax) return false;
  if (f.costMin != null && k.totalCost < f.costMin) return false;
  if (f.costMax != null && k.totalCost > f.costMax) return false;
  if ((f.saleMin != null || f.saleMax != null) && k.applicablePrice == null) return false;
  if (f.saleMin != null && k.applicablePrice! < f.saleMin) return false;
  if (f.saleMax != null && k.applicablePrice! > f.saleMax) return false;
  if (f.profitSign !== "any") {
    if (k.profit == null) return false;
    if (f.profitSign === "positive" && !(k.profit > 0)) return false;
    if (f.profitSign === "negative" && !(k.profit < 0)) return false;
  }
  return true;
}

export type SortKey = "ref" | "name" | "set" | "condition" | "status" | "purchaseDate" | "saleDate" | "cost" | "sale" | "profit" | "created";
export interface Sort {
  key: SortKey;
  dir: "asc" | "desc";
}

export const SORT_LABEL: Record<SortKey, string> = {
  ref: "Referência",
  name: "Nome",
  set: "Coleção",
  condition: "Conservação",
  status: "Situação",
  purchaseDate: "Data de compra",
  saleDate: "Data de venda",
  cost: "Custo total",
  sale: "Valor de venda",
  profit: "Lucro",
  created: "Adicionada em",
};

function sortValue(c: CardRow, key: SortKey): string | number | null {
  const k = key === "cost" || key === "sale" || key === "profit" ? computeCard(c) : null;
  switch (key) {
    case "ref": return c.ref;
    case "name": return normalize(c.name);
    case "set": return c.set_name ? normalize(c.set_name) : null;
    case "condition": return c.condition ? normalize(c.condition) : null;
    case "status": return STATUS_LABEL[c.status];
    case "purchaseDate": return c.purchase_date;
    case "saleDate": return c.sale_date;
    case "cost": return k!.totalCost;
    case "sale": return k!.applicablePrice;
    case "profit": return k!.profit;
    case "created": return c.created_at;
  }
}

const collator = new Intl.Collator("pt-PT", { numeric: true });

/** Valores em falta ficam sempre no fim, qualquer que seja a direção. */
export function sortCards(cards: CardRow[], sort: Sort): CardRow[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...cards].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va == null && vb == null) return collator.compare(a.ref, b.ref);
    if (va == null) return 1;
    if (vb == null) return -1;
    const r = typeof va === "number" && typeof vb === "number" ? va - vb : collator.compare(String(va), String(vb));
    return r !== 0 ? r * dir : collator.compare(a.ref, b.ref);
  });
}

export function applyQuery(cards: CardRow[], f: Filters, sort: Sort): CardRow[] {
  return sortCards(cards.filter((c) => matchesFilters(c, f)), sort);
}

export const DEFAULT_SORT: Sort = { key: "created", dir: "desc" };

/** Descrição legível dos filtros ativos (para chips e para o cabeçalho do PDF). */
export interface ActiveFilter {
  id: string;
  label: string;
}

export function describeFilters(
  f: Filters,
  fmt: { date: (s: string) => string; money: (c: number) => string },
): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  if (f.q.trim()) out.push({ id: "q", label: `Pesquisa${f.field !== "all" ? ` em ${SEARCH_FIELD_LABEL[f.field].toLowerCase()}` : ""}: “${f.q.trim()}”` });
  if (f.sets.length) out.push({ id: "sets", label: `Coleção: ${f.sets.join(" / ")}` });
  if (f.categories.length) out.push({ id: "categories", label: `Categoria: ${f.categories.join(" / ")}` });
  if (f.conditions.length) out.push({ id: "conditions", label: `Conservação: ${f.conditions.join(" / ")}` });
  if (f.statuses.length) out.push({ id: "statuses", label: `Situação: ${f.statuses.map((s) => STATUS_LABEL[s]).join(" / ")}` });
  if (f.sources.length) out.push({ id: "sources", label: `Comprada em: ${f.sources.join(" / ")}` });
  if (f.platforms.length) out.push({ id: "platforms", label: `Vendida em: ${f.platforms.join(" / ")}` });
  const range = (a: string, b: string, name: string, id: string, conv: (v: string) => string) => {
    if (a && b) out.push({ id, label: `${name}: ${conv(a)} a ${conv(b)}` });
    else if (a) out.push({ id, label: `${name}: desde ${conv(a)}` });
    else if (b) out.push({ id, label: `${name}: até ${conv(b)}` });
  };
  range(f.purchaseFrom, f.purchaseTo, "Data de compra", "purchaseDate", fmt.date);
  range(f.saleFrom, f.saleTo, "Data de venda", "saleDate", fmt.date);
  const num = (a: number | null, b: number | null, name: string, id: string) => {
    if (a != null && b != null) out.push({ id, label: `${name}: ${fmt.money(a)} a ${fmt.money(b)}` });
    else if (a != null) out.push({ id, label: `${name}: ≥ ${fmt.money(a)}` });
    else if (b != null) out.push({ id, label: `${name}: ≤ ${fmt.money(b)}` });
  };
  num(f.purchasePriceMin, f.purchasePriceMax, "Preço de compra", "purchasePrice");
  num(f.costMin, f.costMax, "Custo total", "cost");
  num(f.saleMin, f.saleMax, "Valor de venda", "sale");
  if (f.profitSign === "positive") out.push({ id: "profitSign", label: "Só com lucro positivo" });
  if (f.profitSign === "negative") out.push({ id: "profitSign", label: "Só com prejuízo" });
  return out;
}

/** Remove um filtro ativo pelo id. */
export function clearFilter(f: Filters, id: string): Filters {
  switch (id) {
    case "q": return { ...f, q: "", field: "all" };
    case "sets": return { ...f, sets: [] };
    case "categories": return { ...f, categories: [] };
    case "conditions": return { ...f, conditions: [] };
    case "statuses": return { ...f, statuses: [] };
    case "sources": return { ...f, sources: [] };
    case "platforms": return { ...f, platforms: [] };
    case "purchaseDate": return { ...f, purchaseFrom: "", purchaseTo: "" };
    case "saleDate": return { ...f, saleFrom: "", saleTo: "" };
    case "purchasePrice": return { ...f, purchasePriceMin: null, purchasePriceMax: null };
    case "cost": return { ...f, costMin: null, costMax: null };
    case "sale": return { ...f, saleMin: null, saleMax: null };
    case "profitSign": return { ...f, profitSign: "any" };
    default: return f;
  }
}
