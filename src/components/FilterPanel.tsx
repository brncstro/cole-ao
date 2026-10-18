"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { inputCls } from "./ui";
import { STATUSES, STATUS_LABEL } from "@/lib/types";
import { centsToInput, parseMoney } from "@/lib/money";
import type { Filters } from "@/lib/search";

export interface FilterLists {
  sets: string[];
  categories: string[];
  conditions: string[];
  sources: string[];
  platforms: string[];
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <span className="mb-1 block text-sm font-medium" id={`ms-${label}`}>
        {label}
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`ms-${label}`}
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex items-center justify-between text-left`}
      >
        <span className={`truncate ${selected.length ? "" : "text-muted/70"}`}>{selected.length ? (selected.length === 1 ? selected[0] : `${selected.length} selecionados`) : "Todos"}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted" />
      </button>
      {open && (
        <div role="group" aria-label={label} className="absolute z-20 mt-1 max-h-64 w-full min-w-56 overflow-auto rounded-lg border border-line-strong bg-white p-1 shadow-lg">
          {options.length === 0 && <p className="px-2 py-2 text-sm text-muted">Sem opções.</p>}
          {options.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-bg">
              <input
                type="checkbox"
                className="size-4 accent-[#2c5b60]"
                checked={selected.includes(o.value)}
                onChange={(e) => onChange(e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))}
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" className="mt-1 w-full rounded px-2 py-1.5 text-left text-sm text-accent hover:bg-bg" onClick={() => onChange([])}>
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MoneyFilter({ id, label, value, onChange }: { id: string; label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(centsToInput(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    const p = parseMoney(text);
    const cur = p.ok ? p.cents : undefined;
    if (cur !== value && !(cur === undefined && bad)) setText(centsToInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          placeholder={label}
          value={text}
          aria-invalid={bad}
          className={`${inputCls} pr-7`}
          onChange={(e) => {
            setText(e.target.value);
            const p = parseMoney(e.target.value);
            setBad(!p.ok);
            if (p.ok) onChange(p.cents);
          }}
        />
        <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">
          €
        </span>
      </div>
    </div>
  );
}

export function FilterPanel({ filters, setFilters, lists }: { filters: Filters; setFilters: (f: Filters) => void; lists: FilterLists }) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters({ ...filters, [k]: v });
  const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

  return (
    <section aria-label="Filtros" className="rounded-xl border border-line bg-white p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="mb-1 block text-sm font-medium" id="f-status">
            Situação
          </span>
          <div role="group" aria-labelledby="f-status" className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => {
              const on = filters.statuses.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("statuses", on ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s])}
                  className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-white hover:bg-bg"}`}
                >
                  {STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        </div>
        <MultiSelect label="Coleção / edição" options={opts(lists.sets)} selected={filters.sets} onChange={(v) => set("sets", v)} />
        <MultiSelect label="Categoria" options={opts(lists.categories)} selected={filters.categories} onChange={(v) => set("categories", v)} />
        <MultiSelect label="Conservação" options={opts(lists.conditions)} selected={filters.conditions} onChange={(v) => set("conditions", v)} />
        <MultiSelect label="Onde comprou" options={opts(lists.sources)} selected={filters.sources} onChange={(v) => set("sources", v)} />
        <MultiSelect label="Plataforma de venda" options={opts(lists.platforms)} selected={filters.platforms} onChange={(v) => set("platforms", v)} />

        <fieldset>
          <legend className="mb-1 text-sm font-medium">Data de compra</legend>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" aria-label="Compra desde" value={filters.purchaseFrom} onChange={(e) => set("purchaseFrom", e.target.value)} className={inputCls} />
            <input type="date" aria-label="Compra até" value={filters.purchaseTo} onChange={(e) => set("purchaseTo", e.target.value)} className={inputCls} />
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Data de venda</legend>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" aria-label="Venda desde" value={filters.saleFrom} onChange={(e) => set("saleFrom", e.target.value)} className={inputCls} />
            <input type="date" aria-label="Venda até" value={filters.saleTo} onChange={(e) => set("saleTo", e.target.value)} className={inputCls} />
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-medium">Preço de compra</legend>
          <div className="grid grid-cols-2 gap-2">
            <MoneyFilter id="pp-min" label="Mínimo" value={filters.purchasePriceMin} onChange={(v) => set("purchasePriceMin", v)} />
            <MoneyFilter id="pp-max" label="Máximo" value={filters.purchasePriceMax} onChange={(v) => set("purchasePriceMax", v)} />
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Custo total</legend>
          <div className="grid grid-cols-2 gap-2">
            <MoneyFilter id="c-min" label="Mínimo" value={filters.costMin} onChange={(v) => set("costMin", v)} />
            <MoneyFilter id="c-max" label="Máximo" value={filters.costMax} onChange={(v) => set("costMax", v)} />
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Valor de venda</legend>
          <div className="grid grid-cols-2 gap-2">
            <MoneyFilter id="s-min" label="Mínimo" value={filters.saleMin} onChange={(v) => set("saleMin", v)} />
            <MoneyFilter id="s-max" label="Máximo" value={filters.saleMax} onChange={(v) => set("saleMax", v)} />
          </div>
        </fieldset>
        <div>
          <label htmlFor="f-profit" className="mb-1 block text-sm font-medium">
            Lucro
          </label>
          <select id="f-profit" className={inputCls} value={filters.profitSign} onChange={(e) => set("profitSign", e.target.value as Filters["profitSign"])}>
            <option value="any">Qualquer</option>
            <option value="positive">Só com lucro positivo</option>
            <option value="negative">Só com prejuízo</option>
          </select>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Filtros diferentes combinam-se com “E”; várias opções no mesmo filtro combinam-se com “OU”.</p>
    </section>
  );
}
