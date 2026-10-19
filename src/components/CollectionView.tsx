"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Columns3, Download, Filter, LayoutGrid, Plus, Rows3, Search, Trash2, X } from "lucide-react";
import { deleteCards } from "@/app/actions";
import { computeCard } from "@/lib/calc";
import { formatDate, formatEUR } from "@/lib/money";
import { DEFAULT_SORT, EMPTY_FILTERS, SEARCH_FIELD_LABEL, SORT_LABEL, applyQuery, clearFilter, describeFilters, type Filters, type SearchField, type Sort, type SortKey } from "@/lib/search";
import { STATUS_LABEL, type CardRow, type OptionRow } from "@/lib/types";
import { useSignedUrls } from "@/lib/use-signed-urls";
import { MarginValue, Money, ProfitValue, StatusBadge, Thumb } from "./bits";
import { ExportDialog } from "./ExportDialog";
import { FilterPanel } from "./FilterPanel";
import { ConfirmDialog, Empty, Spinner, btnPrimary, btnSecondary, inputCls, useToast } from "./ui";

type ColKey = "set" | "condition" | "status" | "source" | "purchaseDate" | "cost" | "platform" | "sale" | "buyerShipping" | "totalPaid" | "saleDate" | "profit" | "margin";

const COLUMNS: { key: ColKey; label: string; sort?: SortKey; right?: boolean }[] = [
  { key: "set", label: "Coleção", sort: "set" },
  { key: "condition", label: "Conservação", sort: "condition" },
  { key: "status", label: "Situação", sort: "status" },
  { key: "source", label: "Onde comprou" },
  { key: "purchaseDate", label: "Data de compra", sort: "purchaseDate" },
  { key: "cost", label: "Custo total", sort: "cost", right: true },
  { key: "platform", label: "Plataforma" },
  { key: "sale", label: "Valor de venda", sort: "sale", right: true },
  { key: "buyerShipping", label: "Portes cobrados", right: true },
  { key: "totalPaid", label: "Total pago pelo comprador", right: true },
  { key: "saleDate", label: "Data de venda", sort: "saleDate" },
  { key: "profit", label: "Lucro", sort: "profit", right: true },
  { key: "margin", label: "Margem", right: true },
];
const DEFAULT_COLS: ColKey[] = ["set", "condition", "status", "cost", "sale", "profit"];
const PAGE = 60;
const PREFS_KEY = "minha-colecao:prefs:v1";

interface Prefs {
  view: "table" | "gallery";
  cols: ColKey[];
  sort: Sort;
}

function SortTh({ label, k, right, sort, onSort }: { label: string; k: SortKey; right?: boolean; sort: Sort; onSort: (k: SortKey) => void }) {
  return (
    <th scope="col" aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`px-3 py-2.5 font-medium ${right ? "text-right" : ""}`}>
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 rounded hover:text-ink ${right ? "flex-row-reverse" : ""}`}>
        {label}
        {sort.key === k && (sort.dir === "asc" ? <ArrowUp aria-hidden className="size-3" /> : <ArrowDown aria-hidden className="size-3" />)}
      </button>
    </th>
  );
}

export function CollectionView({ cards, options, appName }: { cards: CardRow[]; options: OptionRow[]; appName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<Prefs["view"]>("table");
  const [cols, setCols] = useState<ColKey[]>(DEFAULT_COLS);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [visible, setVisible] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Preferências visuais (apenas vista, colunas e ordenação) em localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Prefs>;
        if (p.view === "table" || p.view === "gallery") setView(p.view);
        if (Array.isArray(p.cols)) setCols(p.cols.filter((c) => COLUMNS.some((x) => x.key === c)));
        if (p.sort?.key && SORT_LABEL[p.sort.key]) setSort(p.sort);
      }
    } catch {}
    setPrefsLoaded(true);
  }, []);
  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ view, cols, sort } satisfies Prefs));
    } catch {}
  }, [view, cols, sort, prefsLoaded]);

  // Atalho "/" para pesquisar.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  useEffect(() => setVisible(PAGE), [filters, sort]);

  const lists = useMemo(() => {
    const merge = (kind: OptionRow["kind"], fromCards: (c: CardRow) => string | null) => {
      const base = options.filter((o) => o.kind === kind).map((o) => o.label);
      const extra = new Set<string>();
      for (const c of cards) {
        const v = fromCards(c);
        if (v && !base.includes(v)) extra.add(v);
      }
      return [...base, ...[...extra].sort((a, b) => a.localeCompare(b, "pt-PT"))];
    };
    return {
      sets: merge("set", (c) => c.set_name).sort((a, b) => a.localeCompare(b, "pt-PT")),
      categories: merge("category", (c) => c.category).sort((a, b) => a.localeCompare(b, "pt-PT")),
      conditions: merge("condition", (c) => c.condition),
      sources: merge("source", (c) => c.purchase_source),
      platforms: merge("platform", (c) => c.sale_platform),
    };
  }, [options, cards]);

  const results = useMemo(() => applyQuery(cards, filters, sort), [cards, filters, sort]);
  const shown = results.slice(0, visible);
  const urlFor = useSignedUrls(useMemo(() => shown.map((c) => c.front_path), [shown]));

  const fmt = { date: formatDate, money: (c: number) => formatEUR(c) };
  const active = useMemo(() => describeFilters(filters, fmt), [filters]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtersActive = active.length > 0;
  const selectedIds = useMemo(() => cards.filter((c) => selected.has(c.id)).map((c) => c.id), [cards, selected]);

  // Remove da seleção cartas que já não existem.
  useEffect(() => {
    setSelected((s) => {
      const ids = new Set(cards.map((c) => c.id));
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [cards]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "ref" || key === "set" ? "asc" : "desc" }));
  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allShownSelected = shown.length > 0 && shown.every((c) => selected.has(c.id));

  async function doDelete() {
    setDeleting(true);
    const r = await deleteCards(selectedIds);
    setDeleting(false);
    setConfirmDelete(false);
    if (r.ok) {
      toast(`${r.data.deleted} ${r.data.deleted === 1 ? "carta eliminada" : "cartas eliminadas"}.`);
      setSelected(new Set());
      router.refresh();
    } else toast(r.error, "error");
  }

  const colOn = (k: ColKey) => cols.includes(k);
  const empty = cards.length === 0;

  const cell = (c: CardRow, k: ColKey, calc: ReturnType<typeof computeCard>) => {
    switch (k) {
      case "set": return <span className="text-muted">{c.set_name ?? "—"}{c.card_number ? ` · ${c.card_number}` : ""}</span>;
      case "condition": return c.condition ?? <span className="text-muted">—</span>;
      case "status": return <StatusBadge status={c.status} />;
      case "source": return c.purchase_source ?? <span className="text-muted">—</span>;
      case "purchaseDate": return <span className="tabular">{formatDate(c.purchase_date)}</span>;
      case "cost": return <Money cents={calc.totalCost} />;
      case "platform": return c.sale_platform ?? <span className="text-muted">—</span>;
      case "sale":
        return calc.applicablePrice == null ? (
          <span className="text-muted">Sem estimativa</span>
        ) : (
          <span className="inline-flex flex-col items-end">
            <Money cents={calc.applicablePrice} />
            <span className="text-[11px] leading-tight text-muted">{c.status === "sold" ? "final (carta)" : "previsto (carta)"}</span>
          </span>
        );
      case "buyerShipping": return calc.applicablePrice == null && !calc.buyerShipping ? <span className="text-muted">—</span> : <Money cents={calc.buyerShipping} />;
      case "totalPaid": return calc.totalPaid == null ? <span className="text-muted">—</span> : <Money cents={calc.totalPaid} />;
      case "saleDate": return <span className="tabular">{formatDate(c.sale_date)}</span>;
      case "profit": return <ProfitValue k={calc} />;
      case "margin": return <MarginValue k={calc} />;
    }
  };

  return (
    <div>
      {/* Cabeçalho: título + adicionar */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-xl font-semibold md:text-2xl">{appName}</h1>
        <Link href="/cartas/nova" className={btnPrimary}>
          <Plus aria-hidden className="size-4" />
          Adicionar carta
        </Link>
      </div>

      {/* Pesquisa */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form role="search" onSubmit={(e) => e.preventDefault()} className="flex min-w-0 flex-1 basis-72 gap-2">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              ref={searchRef}
              type="search"
              aria-label="Pesquisar cartas"
              placeholder='Pesquisar (ex.: Charizard, "001", Base Set)  —  prima / para pesquisar'
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              className={`${inputCls} pl-9`}
            />
          </div>
          <select aria-label="Pesquisar em" value={filters.field} onChange={(e) => setFilters({ ...filters, field: e.target.value as SearchField })} className={`${inputCls} !w-auto max-w-[7.5rem] shrink-0 sm:max-w-[9.5rem]`}>
            {(Object.keys(SEARCH_FIELD_LABEL) as SearchField[]).map((f) => (
              <option key={f} value={f}>
                {SEARCH_FIELD_LABEL[f]}
              </option>
            ))}
          </select>
        </form>
        <button type="button" className={btnSecondary} aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}>
          <Filter aria-hidden className="size-4" />
          Filtros{filtersActive ? ` (${active.filter((a) => a.id !== "q").length})` : ""}
        </button>
      </div>

      {showFilters && <div className="mt-3"><FilterPanel filters={filters} setFilters={setFilters} lists={lists} /></div>}

      {/* Barra de resultados */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm text-muted" aria-live="polite">
          <strong className="font-semibold text-ink">{results.length}</strong> {results.length === 1 ? "carta" : "cartas"}
          {filtersActive && cards.length !== results.length ? ` de ${cards.length}` : ""}
        </p>
        {active.map((a) => (
          <span key={a.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent-soft py-1 pl-3 pr-1.5 text-xs font-medium text-accent">
            <span className="truncate">{a.label}</span>
            <button type="button" aria-label={`Remover filtro: ${a.label}`} className="rounded-full p-0.5 hover:bg-black/10" onClick={() => setFilters(clearFilter(filters, a.id))}>
              <X aria-hidden className="size-3.5" />
            </button>
          </span>
        ))}
        {filtersActive && (
          <button type="button" className="text-sm text-accent underline-offset-2 hover:underline" onClick={() => setFilters(EMPTY_FILTERS)}>
            Limpar filtros
          </button>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <label htmlFor="sortkey" className="sr-only">
              Ordenar por
            </label>
            <select id="sortkey" value={sort.key} onChange={(e) => setSort({ ...sort, key: e.target.value as SortKey })} className={`${inputCls} !w-auto !py-1.5 text-sm`}>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
                </option>
              ))}
            </select>
            <button type="button" className={`${btnSecondary} !px-2`} aria-label={sort.dir === "asc" ? "Ordem crescente — mudar para decrescente" : "Ordem decrescente — mudar para crescente"} onClick={() => setSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" })}>
              {sort.dir === "asc" ? <ArrowUp aria-hidden className="size-4" /> : <ArrowDown aria-hidden className="size-4" />}
            </button>
          </div>

          <div role="group" aria-label="Modo de visualização" className="flex overflow-hidden rounded-lg border border-line-strong">
            {(
              [
                ["table", "Tabela", Rows3],
                ["gallery", "Galeria", LayoutGrid],
              ] as const
            ).map(([id, label, Icon]) => (
              <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`flex min-h-10 items-center gap-1.5 px-3 text-sm ${view === id ? "bg-accent text-accent-ink" : "bg-white hover:bg-bg"}`}>
                <Icon aria-hidden className="size-4" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sr-only sm:hidden">{label}</span>
              </button>
            ))}
          </div>

          {view === "table" && (
            <details className="relative hidden md:block">
              <summary className={`${btnSecondary} list-none`}>
                <Columns3 aria-hidden className="size-4" />
                Colunas
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-line-strong bg-white p-1 shadow-lg">
                {COLUMNS.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-bg">
                    <input type="checkbox" className="size-4 accent-[#2c5b60]" checked={colOn(c.key)} onChange={(e) => setCols(e.target.checked ? COLUMNS.filter((x) => x.key === c.key || colOn(x.key)).map((x) => x.key) : cols.filter((k) => k !== c.key))} />
                    {c.label}
                  </label>
                ))}
              </div>
            </details>
          )}

          <button type="button" className={btnSecondary} onClick={() => setExportOpen(true)} disabled={empty}>
            <Download aria-hidden className="size-4" />
            Exportar
          </button>
        </div>
      </div>

      {/* Seleção */}
      {selected.size > 0 && (
        <div role="region" aria-label="Seleção" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm">
          <strong>{selected.size}</strong> {selected.size === 1 ? "selecionada" : "selecionadas"}
          {results.length > selected.size && (
            <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => setSelected(new Set(results.map((c) => c.id)))}>
              Selecionar todos os {results.length} resultados
            </button>
          )}
          <span className="ml-auto flex gap-2">
            <button type="button" className={`${btnSecondary} !min-h-9`} onClick={() => setExportOpen(true)}>
              <Download aria-hidden className="size-4" />
              Exportar selecionadas
            </button>
            <button type="button" className={`${btnSecondary} !min-h-9 text-neg`} onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden className="size-4" />
              Eliminar
            </button>
            <button type="button" className={`${btnSecondary} !min-h-9`} onClick={() => setSelected(new Set())}>
              Limpar seleção
            </button>
          </span>
        </div>
      )}

      {/* Conteúdo */}
      <div className="mt-4">
        {empty ? (
          <Empty
            title="Ainda não tem cartas"
            action={
              <Link href="/cartas/nova" className={btnPrimary}>
                <Plus aria-hidden className="size-4" />
                Adicionar a primeira carta
              </Link>
            }
          >
            Cada registo representa uma carta física. Adicione fotografias, o custo de compra e, mais tarde, a venda.
          </Empty>
        ) : results.length === 0 ? (
          <Empty
            title="Nenhuma carta corresponde à pesquisa"
            action={
              <button className={btnSecondary} onClick={() => setFilters(EMPTY_FILTERS)}>
                Limpar filtros
              </button>
            }
          >
            Experimente outras palavras ou remova alguns filtros.
          </Empty>
        ) : view === "gallery" ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {shown.map((c) => {
              const k = computeCard(c);
              return (
                <li key={c.id} className="relative flex flex-col overflow-hidden rounded-xl border border-line bg-white">
                  <label className="absolute left-2 top-2 z-10 grid size-7 cursor-pointer place-items-center rounded-md bg-white/90 shadow-sm">
                    <input type="checkbox" className="size-4 accent-[#2c5b60]" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} aria-label={`Selecionar ${c.name}`} />
                  </label>
                  <Link href={`/cartas/${c.id}`} className="flex flex-1 flex-col" aria-label={`Abrir ficha: ${c.name}`}>
                    <Thumb url={urlFor(c.front_path)} alt={`Frente de ${c.name}`} className="aspect-[5/7] w-full !rounded-none !border-0 border-b" />
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <p className="line-clamp-2 text-sm font-semibold leading-snug">{c.name}</p>
                      <p className="line-clamp-1 text-xs text-muted">{[c.set_name, c.condition].filter(Boolean).join(" · ") || "—"}</p>
                      <div className="mt-0.5"><StatusBadge status={c.status} /></div>
                      <dl className="mt-auto grid grid-cols-2 gap-x-2 pt-2 text-xs">
                        <div><dt className="text-muted">Custo</dt><dd className="tabular font-medium">{formatEUR(k.totalCost)}</dd></div>
                        <div className="text-right"><dt className="text-muted">{c.status === "sold" ? "Vendida" : "Previsto"}</dt><dd className="tabular font-medium">{k.applicablePrice == null ? "Sem estimativa" : formatEUR(k.applicablePrice)}</dd></div>
                      </dl>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <>
            {/* Telemóvel: lista compacta em vez de tabela */}
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white md:hidden">
              {shown.map((c) => {
                const k = computeCard(c);
                return (
                  <li key={c.id} className="flex items-center gap-3 p-3">
                    <input type="checkbox" className="size-5 shrink-0 accent-[#2c5b60]" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} aria-label={`Selecionar ${c.name}`} />
                    <Link href={`/cartas/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <Thumb url={urlFor(c.front_path)} alt="" className="h-[68px] w-12 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{c.name}</span>
                        <span className="block truncate text-xs text-muted">{[c.set_name, c.condition].filter(Boolean).join(" · ") || c.ref}</span>
                        <span className="mt-1 block"><StatusBadge status={c.status} /></span>
                      </span>
                      <span className="shrink-0 text-right text-xs">
                        <span className="block text-muted">Custo <Money cents={k.totalCost} className="font-medium text-ink" /></span>
                        <span className="mt-0.5 block"><ProfitValue k={k} /></span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Computador: tabela com cabeçalho fixo */}
            <div className="hidden max-h-[calc(100dvh-15rem)] overflow-auto rounded-xl border border-line bg-white md:block">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_var(--color-line)]">
                  <tr className="text-left text-xs text-muted">
                    <th className="w-10 px-3 py-2.5">
                      <input type="checkbox" className="size-4 accent-[#2c5b60]" aria-label="Selecionar as cartas visíveis" checked={allShownSelected} onChange={(e) => setSelected((s) => { const n = new Set(s); shown.forEach((c) => (e.target.checked ? n.add(c.id) : n.delete(c.id))); return n; })} />
                    </th>
                    <th className="w-14 px-1 py-2.5"><span className="sr-only">Fotografia</span></th>
                    <SortTh label="Ref." k="ref" sort={sort} onSort={toggleSort} />
                    <SortTh label="Carta" k="name" sort={sort} onSort={toggleSort} />
                    {COLUMNS.filter((c) => colOn(c.key)).map((c) =>
                      c.sort ? (
                        <SortTh key={c.key} label={c.label} k={c.sort} right={c.right} sort={sort} onSort={toggleSort} />
                      ) : (
                        <th key={c.key} scope="col" className={`px-3 py-2.5 font-medium ${c.right ? "text-right" : ""}`}>
                          {c.label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const k = computeCard(c);
                    return (
                      <tr key={c.id} className={`border-t border-line align-middle hover:bg-bg/60 ${selected.has(c.id) ? "bg-accent-soft/60" : ""}`}>
                        <td className="px-3 py-2"><input type="checkbox" className="size-4 accent-[#2c5b60]" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} aria-label={`Selecionar ${c.name}`} /></td>
                        <td className="px-1 py-1.5"><Link href={`/cartas/${c.id}`} tabIndex={-1} aria-hidden><Thumb url={urlFor(c.front_path)} alt="" className="h-14 w-10" /></Link></td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted">{c.ref}</td>
                        <td className="max-w-[22rem] px-3 py-2">
                          <Link href={`/cartas/${c.id}`} className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline">{c.name}</Link>
                        </td>
                        {COLUMNS.filter((x) => colOn(x.key)).map((x) => (
                          <td key={x.key} className={`px-3 py-2 ${x.right ? "text-right" : ""} ${x.key === "set" ? "max-w-[14rem] truncate" : ""}`}>{cell(c, x.key, k)}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {results.length > shown.length && (
          <div className="mt-4 text-center">
            <button className={btnSecondary} onClick={() => setVisible((v) => v + PAGE)}>
              Mostrar mais ({results.length - shown.length} restantes)
            </button>
            <p className="mt-1 text-xs text-muted">A pesquisa, os filtros e a exportação abrangem sempre as {results.length} cartas, não apenas as visíveis.</p>
          </div>
        )}
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        counts={{ all: cards.length, filtered: results.length, selected: selectedIds.length }}
        filters={filters}
        sort={sort}
        selectedIds={selectedIds}
        defaultScope={selectedIds.length ? "selected" : filtersActive ? "filtered" : "all"}
        filterSummary={active.map((a) => a.label)}
        key={`${exportOpen}`}
      />

      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={doDelete} busy={deleting} title="Eliminar cartas selecionadas" confirmLabel={deleting ? "A eliminar…" : `Eliminar ${selected.size}`}>
        <p>
          Vai eliminar <strong>{selected.size}</strong> {selected.size === 1 ? "carta" : "cartas"} e as respetivas fotografias. Esta ação não pode ser desfeita.
        </p>
        <p className="mt-2 text-muted">Se quiser guardar uma cópia, faça primeiro o backup em Definições.</p>
        {deleting && <Spinner />}
      </ConfirmDialog>
    </div>
  );
}
