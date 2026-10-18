"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { saveCard } from "@/app/actions";
import { computeCard } from "@/lib/calc";
import { inputToFinancials, validateCardInput, type CardInput } from "@/lib/card-input";
import { formatEUR, formatSignedEUR, formatPercent, centsToInput } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/client";
import { STATUSES, STATUS_LABEL, PROFIT_KIND_LABEL, type OptionRow, type Status } from "@/lib/types";
import { LEAVE_MESSAGE, useDirty } from "./Shell";
import { MoneyInput } from "./MoneyInput";
import { PhotoSlot } from "./PhotoSlot";
import { Field, Spinner, btnPrimary, btnSecondary, inputCls, useToast } from "./ui";

const LANGUAGES = ["Português", "Inglês", "Japonês", "Alemão", "Francês", "Espanhol", "Italiano", "Coreano", "Chinês"];

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-4 md:p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function CardForm({ initial, isNew, userId, options, cardRef }: { initial: CardInput; isNew: boolean; userId: string; options: OptionRow[]; cardRef?: string }) {
  const router = useRouter();
  const toast = useToast();
  const { setDirty } = useDirty();
  const [v, setV] = useState<CardInput>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const uploads = useRef<Set<string>>(new Set());
  const initialJson = useRef(JSON.stringify(initial));

  const dirty = JSON.stringify(v) !== initialJson.current;
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);

  const set = <K extends keyof CardInput>(k: K, val: CardInput[K]) => {
    setV((s) => ({ ...s, [k]: val }));
    if (errors[k as string]) setErrors((e) => { const n = { ...e }; delete n[k as string]; return n; });
  };

  const labels = (kind: OptionRow["kind"]) => options.filter((o) => o.kind === kind).map((o) => o.label);
  const withCurrent = (list: string[], cur: string) => (cur && !list.includes(cur) ? [...list, cur] : list);
  const platforms = options.filter((o) => o.kind === "platform");
  const platformOpt = platforms.find((p) => p.label === v.sale_platform);

  const k = computeCard(inputToFinancials(v));
  const moreOpen = !!(v.card_number || v.category || v.language);
  const graded = /gradu/i.test(v.condition) || !!(v.grading_company || v.grading_grade);

  function onPlatform(label: string) {
    const o = platforms.find((p) => p.label === label);
    setV((s) => ({
      ...s,
      sale_platform: label,
      // Cópia das taxas da plataforma para esta carta; alterações futuras nas definições não a afetam.
      fee_percent: o?.fee_percent != null ? String(o.fee_percent).replace(".", ",") : "",
      fee_fixed: o?.fee_fixed_cents != null ? centsToInput(o.fee_fixed_cents) : "",
    }));
  }

  async function cleanupUploads(keep: string[]) {
    const drop = [...uploads.current].filter((p) => !keep.includes(p));
    if (drop.length) await supabaseBrowser().storage.from("card-photos").remove(drop);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const local = validateCardInput(v);
    if (!local.ok) {
      setErrors(local.errors);
      setFormError("Corrija os campos assinalados.");
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    startTransition(async () => {
      const r = await saveCard(v, isNew);
      if (!r.ok) {
        setErrors(r.errors ?? {});
        setFormError(r.error);
        toast(r.error, "error");
        return;
      }
      await cleanupUploads([v.front_path, v.back_path]);
      setDirty(false);
      toast(isNew ? "Carta adicionada." : "Alterações guardadas.");
      router.push(`/cartas/${r.data.id}`);
      router.refresh();
    });
  }

  async function cancel() {
    if (dirty && !window.confirm(LEAVE_MESSAGE)) return;
    await cleanupUploads([isNew ? "" : initial.front_path, isNew ? "" : initial.back_path]);
    setDirty(false);
    router.push(isNew ? "/" : `/cartas/${initial.id}`);
  }

  const statusHelp: Record<Status, string> = {
    collection: "Só para si. Pode indicar um valor previsto, se quiser estimar.",
    for_sale: "Indique a plataforma e o preço pedido para ver o lucro estimado.",
    sold: "Indique o preço final e a data da venda.",
  };

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-4xl space-y-4 pb-28">
      <div>
        <button type="button" onClick={cancel} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ChevronLeft aria-hidden className="size-4" />
          {isNew ? "Coleção" : "Voltar à ficha"}
        </button>
        <h1 className="text-xl font-semibold md:text-2xl">
          {isNew ? "Adicionar carta" : "Editar carta"}
          {cardRef && <span className="ml-2 font-mono text-sm font-normal text-muted">{cardRef}</span>}
        </h1>
        {isNew && <p className="mt-1 text-sm text-muted">Só o nome e o preço de compra são obrigatórios. A referência é gerada automaticamente.</p>}
      </div>

      <Section title="Carta e fotografias">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="grid grid-cols-2 gap-3">
            <PhotoSlot label="Frente" side="front" path={v.front_path} userId={userId} cardId={v.id} onChange={(p) => set("front_path", p)} onUploaded={(p) => uploads.current.add(p)} error={errors.front_path} />
            <PhotoSlot label="Verso (opcional)" side="back" path={v.back_path} userId={userId} cardId={v.id} onChange={(p) => set("back_path", p)} onUploaded={(p) => uploads.current.add(p)} error={errors.back_path} />
          </div>

          <div className="space-y-4">
            <Field label="Nome da carta *" htmlFor="name" error={errors.name}>
              <input id="name" className={inputCls} value={v.name} autoComplete="off" aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-err" : undefined} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Coleção / edição" htmlFor="set_name" error={errors.set_name}>
                <input id="set_name" list="dl-sets" className={inputCls} value={v.set_name} autoComplete="off" onChange={(e) => set("set_name", e.target.value)} />
                <datalist id="dl-sets">{labels("set").map((l) => <option key={l} value={l} />)}</datalist>
              </Field>
              <Field label="Estado de conservação" htmlFor="condition" error={errors.condition}>
                <select id="condition" className={inputCls} value={v.condition} onChange={(e) => set("condition", e.target.value)}>
                  <option value="">—</option>
                  {withCurrent(labels("condition"), v.condition).map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
            </div>
            {graded && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Empresa de graduação" htmlFor="grading_company" error={errors.grading_company}>
                  <input id="grading_company" className={inputCls} value={v.grading_company} placeholder="PSA, BGS, CGC…" onChange={(e) => set("grading_company", e.target.value)} />
                </Field>
                <Field label="Nota" htmlFor="grading_grade" error={errors.grading_grade}>
                  <input id="grading_grade" className={inputCls} value={v.grading_grade} placeholder="ex.: 9,5" onChange={(e) => set("grading_grade", e.target.value)} />
                </Field>
              </div>
            )}
            <details open={moreOpen} className="rounded-lg border border-line">
              <summary className="px-3 py-2 text-sm font-medium">Mais detalhes (número, categoria, idioma)</summary>
              <div className="grid gap-4 border-t border-line p-3 sm:grid-cols-3">
                <Field label="Número na coleção" htmlFor="card_number" error={errors.card_number}>
                  <input id="card_number" className={inputCls} value={v.card_number} autoComplete="off" placeholder="ex.: 4/102" onChange={(e) => set("card_number", e.target.value)} />
                </Field>
                <Field label="Categoria / jogo" htmlFor="category" error={errors.category}>
                  <input id="category" list="dl-cats" className={inputCls} value={v.category} autoComplete="off" onChange={(e) => set("category", e.target.value)} />
                  <datalist id="dl-cats">{labels("category").map((l) => <option key={l} value={l} />)}</datalist>
                </Field>
                <Field label="Idioma" htmlFor="language" error={errors.language}>
                  <input id="language" list="dl-langs" className={inputCls} value={v.language} autoComplete="off" onChange={(e) => set("language", e.target.value)} />
                  <datalist id="dl-langs">{LANGUAGES.map((l) => <option key={l} value={l} />)}</datalist>
                </Field>
              </div>
            </details>
          </div>
        </div>
      </Section>

      <Section title="Compra" aside={<span className="text-sm text-muted">Custo total: <strong className="tabular text-ink">{formatEUR(k.totalCost)}</strong></span>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Onde comprou" htmlFor="purchase_source" error={errors.purchase_source}>
            <input id="purchase_source" list="dl-sources" className={inputCls} value={v.purchase_source} autoComplete="off" onChange={(e) => set("purchase_source", e.target.value)} />
            <datalist id="dl-sources">{labels("source").map((l) => <option key={l} value={l} />)}</datalist>
          </Field>
          <Field label="Data da compra" htmlFor="purchase_date" error={errors.purchase_date}>
            <input id="purchase_date" type="date" className={inputCls} value={v.purchase_date} aria-invalid={!!errors.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
          </Field>
          <MoneyInput id="purchase_price" label="Preço de compra" required value={v.purchase_price} onChange={(x) => set("purchase_price", x)} error={errors.purchase_price} hint="Use 0 se o custo for zero de propósito (ex.: oferta)." />
          <MoneyInput id="purchase_shipping" label="Portes de compra desta carta" value={v.purchase_shipping} onChange={(x) => set("purchase_shipping", x)} error={errors.purchase_shipping} hint="Se a compra incluiu várias cartas, reparta os portes entre elas — indique só a parte desta carta, para não contar o total várias vezes." />
        </div>
      </Section>

      <Section title="Situação e venda">
        <fieldset>
          <legend className="sr-only">Situação</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Situação">
            {STATUSES.map((s) => (
              <label key={s} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-center text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${v.status === s ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-white hover:bg-bg"}`}>
                <input type="radio" name="status" value={s} checked={v.status === s} onChange={() => set("status", s)} className="sr-only" />
                {STATUS_LABEL[s]}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{statusHelp[v.status]}</p>
        </fieldset>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {v.status !== "collection" && (
            <Field label="Plataforma de venda" htmlFor="sale_platform" error={errors.sale_platform} hint={platformOpt?.fee_is_example ? "Taxas de exemplo — confirme-as em Definições." : undefined}>
              <select id="sale_platform" className={inputCls} value={v.sale_platform} onChange={(e) => onPlatform(e.target.value)}>
                <option value="">—</option>
                {withCurrent(platforms.map((p) => p.label), v.sale_platform).map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
          )}
          {v.status !== "sold" && <MoneyInput id="expected_price" label="Preço de venda previsto" value={v.expected_price} onChange={(x) => set("expected_price", x)} error={errors.expected_price} hint="Em branco = sem estimativa (não é o mesmo que 0 €)." />}
          {v.status === "sold" && (
            <>
              <MoneyInput id="final_price" label="Preço final de venda" required value={v.final_price} onChange={(x) => set("final_price", x)} error={errors.final_price} />
              <Field label="Data da venda *" htmlFor="sale_date" error={errors.sale_date}>
                <input id="sale_date" type="date" className={inputCls} value={v.sale_date} aria-invalid={!!errors.sale_date} aria-describedby={errors.sale_date ? "sale_date-err" : undefined} onChange={(e) => set("sale_date", e.target.value)} />
              </Field>
            </>
          )}
        </div>

        {v.status !== "collection" && (
          <details open={!!(v.sale_shipping || v.packaging || v.fee_actual) } className="mt-4 rounded-lg border border-line">
            <summary className="px-3 py-2 text-sm font-medium">Taxas, portes de venda e embalagem</summary>
            <div className="grid gap-4 border-t border-line p-3 sm:grid-cols-2">
              <MoneyInput id="sale_shipping" label="Portes de venda suportados por mim" value={v.sale_shipping} onChange={(x) => set("sale_shipping", x)} error={errors.sale_shipping} hint="Só o que pagou do seu bolso. Se o comprador pagou os portes, deixe 0." />
              <MoneyInput id="packaging" label="Embalagem" value={v.packaging} onChange={(x) => set("packaging", x)} error={errors.packaging} />
              <Field label="Taxa percentual da plataforma (%)" htmlFor="fee_percent" error={errors.fee_percent}>
                <input id="fee_percent" inputMode="decimal" className={`${inputCls} tabular`} value={v.fee_percent} placeholder="0" aria-invalid={!!errors.fee_percent} onChange={(e) => set("fee_percent", e.target.value)} />
              </Field>
              <MoneyInput id="fee_fixed" label="Taxa fixa da plataforma" value={v.fee_fixed} onChange={(x) => set("fee_fixed", x)} error={errors.fee_fixed} />
              {v.status === "sold" && (
                <MoneyInput id="fee_actual" label="Taxas efetivamente cobradas (opcional)" value={v.fee_actual} onChange={(x) => set("fee_actual", x)} error={errors.fee_actual} hint="Se preencher (mesmo 0), este valor substitui as taxas calculadas." />
              )}
              <p className="self-end text-sm text-muted sm:col-span-2">
                Taxas {k.feesAreManual ? "efetivas" : "calculadas"}: <strong className="tabular text-ink">{k.fees == null ? "— (sem preço de venda)" : formatEUR(k.fees)}</strong>
              </p>
            </div>
          </details>
        )}
      </Section>

      <Section title="Notas">
        <Field label="Notas" htmlFor="notes" error={errors.notes}>
          <textarea id="notes" rows={4} className={inputCls} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </Section>

      {/* Barra fixa: pré-visualização + ações */}
      <div className="fixed inset-x-0 bottom-14 z-20 border-t border-line bg-white/95 px-4 py-2.5 md:bottom-0 md:left-[84px] md:px-8">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-2">
          <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-0.5 text-sm" aria-live="polite">
            <div className="flex gap-1.5"><dt className="text-muted">Custo total</dt><dd className="tabular font-semibold">{formatEUR(k.totalCost)}</dd></div>
            <div className="flex gap-1.5">
              <dt className="text-muted">Lucro {k.profitKind !== "none" ? PROFIT_KIND_LABEL[k.profitKind].toLowerCase() : ""}</dt>
              <dd className={`tabular font-semibold ${k.profit == null ? "text-muted" : k.profit > 0 ? "text-pos" : k.profit < 0 ? "text-neg" : ""}`}>
                {k.profit == null ? "Sem estimativa" : `${formatSignedEUR(k.profit)}${k.margin != null ? ` (${formatPercent(k.margin)})` : ""}`}
              </dd>
            </div>
          </dl>
          {formError && <p role="alert" className="text-sm text-neg">{formError}</p>}
          <div className="ml-auto flex gap-2">
            <button type="button" className={btnSecondary} onClick={cancel} disabled={pending}>Cancelar</button>
            <button type="submit" className={btnPrimary} disabled={pending}>
              {pending && <Spinner />}
              {pending ? "A guardar…" : "Guardar carta"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
