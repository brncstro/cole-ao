"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Dialog, Spinner, btnPrimary, btnSecondary, useToast } from "./ui";
import type { Filters, Sort } from "@/lib/search";

export type ExportScope = "all" | "filtered" | "selected";

export function ExportDialog({
  open,
  onClose,
  counts,
  filters,
  sort,
  selectedIds,
  defaultScope,
  filterSummary,
}: {
  open: boolean;
  onClose: () => void;
  counts: { all: number; filtered: number; selected: number };
  filters: Filters;
  sort: Sort;
  selectedIds: string[];
  defaultScope: ExportScope;
  filterSummary: string[];
}) {
  const toast = useToast();
  const [scope, setScope] = useState<ExportScope>(defaultScope);
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [summary, setSummary] = useState(true);
  const [thumbs, setThumbs] = useState(false);
  const [pageSize, setPageSize] = useState<"A3" | "A4">("A3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopes: { id: ExportScope; label: string; n: number; disabled?: boolean }[] = [
    { id: "all", label: "Toda a coleção", n: counts.all },
    { id: "filtered", label: "Todos os resultados da pesquisa e filtros (incluindo outras páginas)", n: counts.filtered },
    { id: "selected", label: "Apenas os registos selecionados", n: counts.selected, disabled: counts.selected === 0 },
  ];
  const n = scopes.find((s) => s.id === scope)!.n;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, scope, filters, sort, ids: scope === "selected" ? selectedIds : undefined, options: { summary, thumbnails: thumbs, pageSize } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Falha na exportação (${res.status}).`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? `colecao.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast(`Exportação concluída: ${name}`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na exportação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title="Exportar"
      wide
      footer={
        <>
          <button className={btnSecondary} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className={btnPrimary} onClick={run} disabled={busy || n === 0}>
            {busy ? <Spinner /> : <Download aria-hidden className="size-4" />}
            {busy ? "A gerar…" : `Exportar ${n} ${n === 1 ? "carta" : "cartas"}`}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">O que exportar</legend>
          <div className="space-y-2">
            {scopes.map((s) => (
              <label key={s.id} className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${scope === s.id ? "border-accent bg-accent-soft" : "border-line"} ${s.disabled ? "opacity-50" : "cursor-pointer"}`}>
                <input type="radio" name="scope" className="mt-1 accent-[#2c5b60]" checked={scope === s.id} disabled={s.disabled} onChange={() => setScope(s.id)} />
                <span>
                  {s.label} <span className="text-muted">({s.n})</span>
                  {s.id === "filtered" && filterSummary.length > 0 && <span className="mt-0.5 block text-xs text-muted">{filterSummary.join(" · ")}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Formato</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["pdf", "PDF (relatório)", FileText],
                ["xlsx", "Excel (.xlsx)", FileSpreadsheet],
              ] as const
            ).map(([id, label, Icon]) => (
              <label key={id} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${format === id ? "border-accent bg-accent-soft" : "border-line"}`}>
                <input type="radio" name="format" className="accent-[#2c5b60]" checked={format === id} onChange={() => setFormat(id)} />
                <Icon aria-hidden className="size-4 text-muted" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold">Opções</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[#2c5b60]" checked={summary} onChange={(e) => setSummary(e.target.checked)} />
            Incluir resumo das cartas exportadas
          </label>
          {format === "pdf" && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[#2c5b60]" checked={thumbs} onChange={(e) => setThumbs(e.target.checked)} />
                Incluir miniaturas (ficheiro maior e mais lento)
              </label>
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor="pgsize">Formato da página:</label>
                <select id="pgsize" className="rounded-lg border border-line-strong bg-white px-2 py-1.5" value={pageSize} onChange={(e) => setPageSize(e.target.value as "A3" | "A4")}>
                  <option value="A3">A3 horizontal (recomendado — texto maior)</option>
                  <option value="A4">A4 horizontal (texto mais pequeno)</option>
                </select>
              </div>
            </>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="rounded-lg bg-[#fbeceb] px-3 py-2 text-sm text-neg">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
