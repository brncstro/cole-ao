/**
 * Aritmética monetária em cêntimos inteiros. Nunca usar floats para somar dinheiro.
 */

export type MoneyParse =
  | { ok: true; cents: number | null } // null = campo em branco (≠ zero)
  | { ok: false; error: string };

/**
 * Interpreta texto monetário em formato português ("1.234,56", "12,5", "12.50", "12 €").
 * Campo vazio devolve cents=null (em branco), "0" devolve 0.
 */
export function parseMoney(input: string | null | undefined): MoneyParse {
  if (input == null) return { ok: true, cents: null };
  let s = String(input).replace(/[€\s ]/g, "");
  if (s === "") return { ok: true, cents: null };
  if (s.startsWith("-") || s.startsWith("−")) return { ok: false, error: "O valor não pode ser negativo." };
  if (!/^[\d.,]+$/.test(s)) return { ok: false, error: "Valor inválido. Use apenas números, por exemplo 12,50." };

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let intPart: string;
  let fracPart = "";

  if (lastComma !== -1 && lastDot !== -1) {
    // O último separador é o decimal; o outro é de milhares.
    const dec = Math.max(lastComma, lastDot);
    const thousands = dec === lastComma ? "." : ",";
    intPart = s.slice(0, dec).split(thousands).join("");
    fracPart = s.slice(dec + 1);
    if (intPart.includes(",") || intPart.includes(".")) return { ok: false, error: "Valor inválido." };
  } else if (lastComma !== -1) {
    if (s.indexOf(",") !== lastComma) return { ok: false, error: "Valor inválido." };
    intPart = s.slice(0, lastComma);
    fracPart = s.slice(lastComma + 1);
  } else if (lastDot !== -1) {
    const parts = s.split(".");
    const last = parts[parts.length - 1];
    if (parts.length > 2 || last.length === 3) {
      // "1.234" ou "1.234.567" → separador de milhares
      if (!parts.slice(1).every((p) => p.length === 3)) return { ok: false, error: "Valor inválido." };
      intPart = parts.join("");
    } else {
      intPart = parts[0];
      fracPart = last;
    }
  } else {
    intPart = s;
  }

  if (intPart === "") intPart = "0";
  if (!/^\d+$/.test(intPart) || (fracPart !== "" && !/^\d+$/.test(fracPart))) {
    return { ok: false, error: "Valor inválido." };
  }
  if (fracPart.length > 2) return { ok: false, error: "Use no máximo duas casas decimais." };
  if (intPart.length > 9) return { ok: false, error: "Valor demasiado grande." };

  const cents = Number(intPart) * 100 + Number((fracPart + "00").slice(0, 2));
  return { ok: true, cents };
}

/** Texto editável (sem símbolo) a partir de cêntimos: 1234 → "12,34"; null → "". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

export function formatEUR(cents: number | null | undefined, empty = "—"): string {
  if (cents == null) return empty;
  return eur.format(cents / 100);
}

/** Valor com sinal explícito (+ / −) para lucros. */
export function formatSignedEUR(cents: number | null | undefined, empty = "—"): string {
  if (cents == null) return empty;
  if (cents === 0) return eur.format(0);
  const body = eur.format(Math.abs(cents) / 100);
  return cents > 0 ? `+${body}` : `−${body}`;
}

export function formatPercent(value: number | null | undefined, empty = "—"): string {
  if (value == null || !Number.isFinite(value)) return empty;
  const s = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(value));
  if (value === 0 || s === "0,0") return "0,0 %";
  return `${value > 0 ? "+" : "−"}${s} %`;
}

/** Percentagem de taxa (ex.: 5 → "5 %", 12.8 → "12,8 %"). */
export function formatFeePercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(value)} %`;
}

/** "2026-03-09" → "09/03/2026" (sem passar por Date, para evitar fusos horários). */
export function formatDate(iso: string | null | undefined, empty = "—"): string {
  if (!iso) return empty;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : empty;
}

/** Interpreta número decimal em formato PT ("12,8") para percentagens. null se vazio. */
export function parseDecimal(input: string | null | undefined): { ok: true; value: number | null } | { ok: false; error: string } {
  if (input == null) return { ok: true, value: null };
  const s = input.replace(/[%\s ]/g, "").replace(",", ".");
  if (s === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: "Número inválido." };
  const n = Number(s);
  if (n > 100) return { ok: false, error: "A percentagem não pode exceder 100." };
  return { ok: true, value: Math.round(n * 100) / 100 };
}
