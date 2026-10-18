"use client";

import { ImageOff } from "lucide-react";
import { Badge } from "./ui";
import { STATUS_LABEL, PROFIT_KIND_LABEL, type Status, type ProfitKind } from "@/lib/types";
import { formatEUR, formatPercent, formatSignedEUR } from "@/lib/money";
import type { Computed } from "@/lib/calc";

export function StatusBadge({ status }: { status: Status }) {
  return <Badge tone={status === "for_sale" ? "accent" : status === "sold" ? "neutral" : "muted"}>{STATUS_LABEL[status]}</Badge>;
}

/** Imagem sem cortes (object-contain) com marcador quando não há fotografia. */
export function Thumb({ url, alt, className = "" }: { url: string | null; alt: string; className?: string }) {
  return (
    <div className={`grid place-items-center overflow-hidden rounded-md border border-line bg-bg ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} loading="lazy" className="h-full w-full object-contain" />
      ) : (
        <ImageOff aria-label="Sem fotografia" className="size-5 text-muted/60" />
      )}
    </div>
  );
}

export function Money({ cents, className = "" }: { cents: number | null | undefined; className?: string }) {
  return <span className={`tabular whitespace-nowrap ${className}`}>{formatEUR(cents)}</span>;
}

/** Lucro com sinal e texto explícito (cor nunca é a única pista). */
export function ProfitValue({ k, showKind = true, align = "right" }: { k: Computed; showKind?: boolean; align?: "right" | "left" }) {
  if (k.profit == null) return <span className="text-muted">Sem estimativa</span>;
  const tone = k.profit > 0 ? "text-pos" : k.profit < 0 ? "text-neg" : "text-ink";
  return (
    <span className={`inline-flex flex-col ${align === "right" ? "items-end" : "items-start"}`}>
      <span className={`tabular whitespace-nowrap font-medium ${tone}`}>{formatSignedEUR(k.profit)}</span>
      {showKind && <span className="text-[11px] leading-tight text-muted">{PROFIT_KIND_LABEL[k.profitKind]}</span>}
    </span>
  );
}

export function MarginValue({ k }: { k: Computed }) {
  if (k.profit == null) return <span className="text-muted">—</span>;
  return <span className="tabular whitespace-nowrap">{formatPercent(k.margin)}</span>;
}

export function KindTag({ kind }: { kind: ProfitKind }) {
  return <Badge tone={kind === "realized" ? "accent" : "muted"}>{PROFIT_KIND_LABEL[kind]}</Badge>;
}
