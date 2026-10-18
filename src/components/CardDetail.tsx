"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Copy, Pencil, Repeat, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { deleteCard, duplicateCard, setCardStatus } from "@/app/actions";
import { computeCard } from "@/lib/calc";
import type { CardInput } from "@/lib/card-input";
import { centsToInput, formatDate, formatEUR, formatFeePercent, formatPercent, formatSignedEUR } from "@/lib/money";
import { STATUSES, STATUS_LABEL, type CardRow, type OptionRow, type Status } from "@/lib/types";
import { useSignedUrls } from "@/lib/use-signed-urls";
import { KindTag, ProfitValue, StatusBadge, Thumb } from "./bits";
import { MoneyInput } from "./MoneyInput";
import { ConfirmDialog, Dialog, Field, Spinner, btnPrimary, btnSecondary, inputCls, useToast } from "./ui";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm tabular">{children ?? "—"}</dd>
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-4 md:p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </div>
      <dl>{children}</dl>
    </section>
  );
}

function Lightbox({ open, onClose, items, index, setIndex }: { open: boolean; onClose: () => void; items: { label: string; url: string | null }[]; index: number; setIndex: (i: number) => void }) {
  const [zoom, setZoom] = useState(false);
  useEffect(() => setZoom(false), [index, open]);
  const cur = items[index];
  return (
    <Dialog open={open} onClose={onClose} wide title={cur ? `${cur.label} — ampliar` : "Fotografia"}
      footer={
        <>
          {items.length > 1 && items.map((it, i) => (
            <button key={it.label} className={i === index ? btnPrimary : btnSecondary} onClick={() => setIndex(i)} aria-pressed={i === index}>{it.label}</button>
          ))}
          <button className={btnSecondary} onClick={() => setZoom((z) => !z)}>
            {zoom ? <ZoomOut aria-hidden className="size-4" /> : <ZoomIn aria-hidden className="size-4" />}
            {zoom ? "Ajustar ao ecrã" : "Ampliar 200 %"}
          </button>
        </>
      }>
      <div className={`overflow-auto rounded-md bg-bg ${zoom ? "max-h-[65dvh]" : ""}`}>
        {cur?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cur.url} alt={cur.label} className={zoom ? "max-w-none" : "mx-auto max-h-[65dvh] w-auto object-contain"} style={zoom ? { width: "200%" } : undefined} />
        ) : (
          <p className="p-8 text-center text-sm text-muted">Sem fotografia.</p>
        )}
      </div>
    </Dialog>
  );
}

function StatusDialog({ card, options, open, onClose }: { card: CardRow; options: OptionRow[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD no fuso local
  const [status, setStatus] = useState<Status>(card.status);
  const [platform, setPlatform] = useState(card.sale_platform ?? "");
  const [final, setFinal] = useState(centsToInput(card.final_price_cents));
  const [date, setDate] = useState(card.sale_date ?? today);
  const [expected, setExpected] = useState(centsToInput(card.expected_price_cents));
  const [shipping, setShipping] = useState(centsToInput(card.sale_shipping_cents));
  const [packaging, setPackaging] = useState(centsToInput(card.packaging_cents));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const platforms = options.filter((o) => o.kind === "platform");

  useEffect(() => {
    if (!open) return;
    setStatus(card.status); setPlatform(card.sale_platform ?? ""); setFinal(centsToInput(card.final_price_cents));
    setDate(card.sale_date ?? today); setExpected(centsToInput(card.expected_price_cents));
    setShipping(centsToInput(card.sale_shipping_cents)); setPackaging(centsToInput(card.packaging_cents)); setErrors({});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true);
    const o = platforms.find((p) => p.label === platform);
    const patch: Partial<CardInput> = { status, sale_platform: platform, expected_price: expected, sale_shipping: shipping, packaging };
    // Ao escolher outra plataforma, copia as taxas dela para esta carta (snapshot).
    if (platform !== (card.sale_platform ?? "") && o) {
      patch.fee_percent = o.fee_percent != null ? String(o.fee_percent).replace(".", ",") : "";
      patch.fee_fixed = centsToInput(o.fee_fixed_cents);
    }
    if (status === "sold") { patch.final_price = final; patch.sale_date = date; }
    const r = await setCardStatus(card.id, patch);
    setBusy(false);
    if (r.ok) { toast(`Situação alterada para “${STATUS_LABEL[status]}”.`); onClose(); router.refresh(); }
    else { setErrors(r.errors ?? {}); toast(r.error, "error"); }
  }

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title="Mudar situação"
      footer={<><button className={btnSecondary} onClick={onClose} disabled={busy}>Cancelar</button><button className={btnPrimary} onClick={save} disabled={busy || status === card.status && status !== "sold" && platform === (card.sale_platform ?? "") && expected === centsToInput(card.expected_price_cents)}>{busy && <Spinner />}Guardar</button></>}>
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Situação" className="grid grid-cols-3 gap-2">
          {STATUSES.map((s) => (
            <label key={s} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-center text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${status === s ? "border-accent bg-accent text-accent-ink" : "border-line-strong hover:bg-bg"}`}>
              <input type="radio" name="st" className="sr-only" checked={status === s} onChange={() => setStatus(s)} />{STATUS_LABEL[s]}
            </label>
          ))}
        </div>
        {card.status === "sold" && status !== "sold" && (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm">Ao reabrir esta carta, o preço final, a data e as taxas efetivas da venda serão removidos.</p>
        )}
        {status !== "collection" && (
          <Field label="Plataforma de venda" htmlFor="st-platform" error={errors.sale_platform}>
            <select id="st-platform" className={inputCls} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">—</option>
              {[...platforms.map((p) => p.label), ...(platform && !platforms.some((p) => p.label === platform) ? [platform] : [])].map((l) => <option key={l}>{l}</option>)}
            </select>
          </Field>
        )}
        {status === "sold" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyInput id="st-final" label="Preço final de venda" required value={final} onChange={setFinal} error={errors.final_price} />
            <Field label="Data da venda *" htmlFor="st-date" error={errors.sale_date}>
              <input id="st-date" type="date" className={inputCls} value={date} aria-invalid={!!errors.sale_date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <MoneyInput id="st-ship" label="Portes de venda suportados por mim" value={shipping} onChange={setShipping} error={errors.sale_shipping} hint="0 se o comprador pagou." />
            <MoneyInput id="st-pack" label="Embalagem" value={packaging} onChange={setPackaging} error={errors.packaging} />
          </div>
        ) : (
          <MoneyInput id="st-exp" label="Preço de venda previsto" value={expected} onChange={setExpected} error={errors.expected_price} hint="Em branco = sem estimativa." />
        )}
        {status === "sold" && <p className="text-xs text-muted">Pode ajustar taxas efetivas e outros detalhes em “Editar”.</p>}
      </div>
    </Dialog>
  );
}

export function CardDetail({ card, options }: { card: CardRow; options: OptionRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const k = computeCard(card);
  const urlFor = useSignedUrls([card.front_path, card.back_path]);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState<"dup" | "del" | null>(null);
  const lastIdx = useRef(0);

  const photos = [
    { label: "Frente", path: card.front_path },
    { label: "Verso", path: card.back_path },
  ].filter((p) => p.path);
  const items = photos.map((p) => ({ label: p.label, url: urlFor(p.path) }));

  async function dup() {
    setBusy("dup");
    const r = await duplicateCard(card.id);
    setBusy(null);
    if (r.ok) { toast("Carta duplicada com nova referência. Reveja os dados e guarde."); router.push(`/cartas/${r.data.id}/editar`); router.refresh(); }
    else toast(r.error, "error");
  }
  async function del() {
    setBusy("del");
    const r = await deleteCard(card.id);
    setBusy(null);
    if (r.ok) { toast("Carta eliminada."); router.push("/"); router.refresh(); }
    else { setConfirmDel(false); toast(r.error, "error"); }
  }

  const feeLabel = k.fees == null ? "—" : formatEUR(k.fees);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft aria-hidden className="size-4" /> Coleção
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold md:text-2xl">{card.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-mono">{card.ref}</span>
            <StatusBadge status={card.status} />
            {[card.set_name, card.card_number, card.condition].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/cartas/${card.id}/editar`} className={btnPrimary}><Pencil aria-hidden className="size-4" />Editar</Link>
          <button className={btnSecondary} onClick={() => setStatusOpen(true)}><Repeat aria-hidden className="size-4" />Mudar situação</button>
          <button className={btnSecondary} onClick={dup} disabled={busy !== null}>{busy === "dup" ? <Spinner /> : <Copy aria-hidden className="size-4" />}Duplicar</button>
          <button className={`${btnSecondary} text-neg`} onClick={() => setConfirmDel(true)}><Trash2 aria-hidden className="size-4" />Eliminar</button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="grid grid-cols-2 gap-3 self-start lg:grid-cols-1">
          {[{ label: "Frente", path: card.front_path }, { label: "Verso", path: card.back_path }].map((p) => {
            if (!p.path && p.label === "Verso") return null;
            const idx = photos.findIndex((x) => x.label === p.label);
            return p.path ? (
              <button key={p.label} type="button" className="group relative block w-full text-left" aria-label={`Ampliar fotografia: ${p.label.toLowerCase()}`} onClick={() => { lastIdx.current = idx; setLightbox(idx); }}>
                <Thumb url={urlFor(p.path)} alt={`${p.label} de ${card.name}`} className="aspect-[5/7] w-full" />
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-medium shadow-sm"><ZoomIn aria-hidden className="size-3.5" />Ampliar</span>
              </button>
            ) : (
              <div key={p.label}>
                <Thumb url={null} alt="" className="aspect-[5/7] w-full" />
                <p className="mt-1 text-center text-xs text-muted">Sem fotografia</p>
              </div>
            );
          })}
        </div>

        <div className="space-y-4">
          <Section title="Identificação">
            <Row label="Coleção / edição">{card.set_name}</Row>
            <Row label="Número">{card.card_number}</Row>
            <Row label="Categoria / jogo">{card.category}</Row>
            <Row label="Idioma">{card.language}</Row>
            <Row label="Conservação">{card.condition}</Row>
            {(card.grading_company || card.grading_grade) && <Row label="Graduação">{[card.grading_company, card.grading_grade].filter(Boolean).join(" ")}</Row>}
          </Section>

          <Section title="Compra">
            <Row label="Onde comprou">{card.purchase_source}</Row>
            <Row label="Data da compra">{formatDate(card.purchase_date)}</Row>
            <Row label="Preço de compra">{formatEUR(card.purchase_price_cents)}</Row>
            <Row label="Portes de compra">{formatEUR(card.purchase_shipping_cents)}</Row>
            <Row label="Custo total"><strong>{formatEUR(k.totalCost)}</strong></Row>
          </Section>

          <Section title="Situação e venda" aside={<KindTag kind={k.profitKind} />}>
            <Row label="Situação">{STATUS_LABEL[card.status]}</Row>
            <Row label="Plataforma de venda">{card.sale_platform}</Row>
            {card.status === "sold" ? (
              <>
                <Row label="Preço final de venda">{formatEUR(card.final_price_cents)}</Row>
                <Row label="Data da venda">{formatDate(card.sale_date)}</Row>
              </>
            ) : (
              <Row label="Preço de venda previsto">{card.expected_price_cents == null ? <span className="text-muted">Sem estimativa</span> : formatEUR(card.expected_price_cents)}</Row>
            )}
            <Row label={`Taxas (${k.feesAreManual ? "efetivas" : "calculadas"})`}>
              {feeLabel}
              {!k.feesAreManual && (card.fee_percent != null || card.fee_fixed_cents != null) && (
                <span className="block text-xs text-muted">{formatFeePercent(card.fee_percent ?? 0)} + {formatEUR(card.fee_fixed_cents ?? 0)}</span>
              )}
            </Row>
            <Row label="Portes de venda (suportados por mim)">{formatEUR(card.sale_shipping_cents)}</Row>
            <Row label="Embalagem">{formatEUR(card.packaging_cents)}</Row>
            <Row label={`Lucro ${k.profitKind === "realized" ? "realizado" : k.profitKind === "estimated" ? "estimado" : ""}`.trim()}><ProfitValue k={k} showKind={false} /></Row>
            <Row label="Margem sobre o custo">{k.profit == null ? "—" : formatPercent(k.margin)}</Row>
          </Section>

          {card.notes && (
            <section className="rounded-xl border border-line bg-white p-4 md:p-5">
              <h2 className="mb-2 text-base font-semibold">Notas</h2>
              <p className="whitespace-pre-wrap text-sm">{card.notes}</p>
            </section>
          )}
        </div>
      </div>

      <Lightbox open={lightbox !== null} onClose={() => setLightbox(null)} items={items} index={lightbox ?? lastIdx.current} setIndex={(i) => setLightbox(i)} />
      <StatusDialog card={card} options={options} open={statusOpen} onClose={() => setStatusOpen(false)} />
      <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={del} busy={busy === "del"} title="Eliminar carta" confirmLabel={busy === "del" ? "A eliminar…" : "Eliminar carta"}>
        <p>Vai eliminar <strong>{card.name}</strong> ({card.ref}) e as respetivas fotografias. Esta ação não pode ser desfeita.</p>
      </ConfirmDialog>
    </div>
  );
}
