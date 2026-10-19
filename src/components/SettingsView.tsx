"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, Plus, Trash2 } from "lucide-react";
import { addOption, deleteOption, renameOption, setAppName, updatePlatformFees } from "@/app/actions";
import { centsToInput, formatEUR, formatFeePercent } from "@/lib/money";
import { OPTION_KIND_LABEL, type OptionKind, type OptionRow, type ProfileRow } from "@/lib/types";
import { ConfirmDialog, Field, Spinner, btnPrimary, btnSecondary, inputCls, useToast } from "./ui";
import { LEAVE_MESSAGE } from "./Shell";
import { signOut } from "@/app/actions";

const KINDS: OptionKind[] = ["set", "category", "condition", "source", "platform"];

function OptionList({ kind, items }: { kind: OptionKind; items: OptionRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [fees, setFees] = useState<Record<string, { p: string; f: string; s: boolean }>>({});
  const [del, setDel] = useState<OptionRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(p: Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.ok) { toast(ok); router.refresh(); return true; }
    toast(r.error ?? "Erro.", "error");
    return false;
  }

  return (
    <section className="rounded-xl border border-line bg-white p-4 md:p-5">
      <h2 className="text-base font-semibold">{OPTION_KIND_LABEL[kind]}</h2>
      {kind === "platform" && (
        <p className="mt-1 text-sm text-muted">
          As taxas abaixo são <strong>exemplos configuráveis</strong>, não valores garantidos — confirme-as nas condições atuais de cada plataforma. Por defeito a percentagem incide só sobre o preço da carta; assinale a opção se a plataforma também a aplica aos portes cobrados. Alterar isto só afeta vendas futuras: cada carta guarda a sua própria cópia.
        </p>
      )}
      {kind === "set" || kind === "category" ? <p className="mt-1 text-sm text-muted">Também são criadas automaticamente quando as escreve num formulário.</p> : null}
      <ul className="mt-3 divide-y divide-line">
        {items.length === 0 && <li className="py-3 text-sm text-muted">Ainda sem opções.</li>}
        {items.map((o) => (
          <li key={o.id} className="py-2.5">
            {editing === o.id ? (
              <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run(renameOption(kind, o.label, text), "Renomeada. As cartas existentes foram atualizadas.")) setEditing(null); }}>
                <label className="sr-only" htmlFor={`rn-${o.id}`}>Novo nome</label>
                <input id={`rn-${o.id}`} autoFocus className={inputCls} value={text} onChange={(e) => setText(e.target.value)} />
                <button className={btnPrimary} disabled={busy}>Guardar</button>
                <button type="button" className={btnSecondary} onClick={() => setEditing(null)}>Cancelar</button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="min-w-0 flex-1 text-sm font-medium">{o.label}</span>
                {kind === "platform" && (() => {
                  const f = fees[o.id] ?? { p: o.fee_percent == null ? "" : String(o.fee_percent).replace(".", ","), f: centsToInput(o.fee_fixed_cents), s: !!o.fee_on_shipping };
                  const changed = f.p !== (o.fee_percent == null ? "" : String(o.fee_percent).replace(".", ",")) || f.f !== centsToInput(o.fee_fixed_cents) || f.s !== !!o.fee_on_shipping;
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1 text-xs text-muted">Taxa %
                        <input aria-label={`Taxa percentual — ${o.label}`} inputMode="decimal" className={`${inputCls} !w-20 !py-1.5 tabular`} value={f.p} onChange={(e) => setFees({ ...fees, [o.id]: { ...f, p: e.target.value } })} />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-muted">Fixa €
                        <input aria-label={`Taxa fixa — ${o.label}`} inputMode="decimal" className={`${inputCls} !w-20 !py-1.5 tabular`} value={f.f} onChange={(e) => setFees({ ...fees, [o.id]: { ...f, f: e.target.value } })} />
                      </label>
                      <label className="flex basis-full items-center gap-1.5 text-xs text-muted">
                        <input type="checkbox" className="size-4 accent-[#2c5b60]" checked={f.s} onChange={(e) => setFees({ ...fees, [o.id]: { ...f, s: e.target.checked } })} />
                        A taxa % incide também sobre os portes cobrados ao comprador
                      </label>
                      {o.fee_is_example && !changed && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">exemplo</span>}
                      {(changed || o.fee_is_example) && (
                        <button className={`${btnSecondary} !min-h-8 !px-2.5 text-xs`} disabled={busy} onClick={() => run(updatePlatformFees(o.id, f.p, f.f, f.s), "Taxas guardadas (só afetam vendas futuras).")}>
                          {changed ? "Guardar taxas" : "Confirmar taxas"}
                        </button>
                      )}
                    </div>
                  );
                })()}
                <button className="rounded p-2 text-muted hover:bg-black/5 hover:text-ink" aria-label={`Renomear ${o.label}`} onClick={() => { setEditing(o.id); setText(o.label); }}><Pencil aria-hidden className="size-4" /></button>
                <button className="rounded p-2 text-muted hover:bg-black/5 hover:text-neg" aria-label={`Remover ${o.label}`} onClick={() => setDel(o)}><Trash2 aria-hidden className="size-4" /></button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (adding.trim() && (await run(addOption(kind, adding), "Adicionada."))) setAdding(""); }}>
        <label className="sr-only" htmlFor={`add-${kind}`}>Nova opção — {OPTION_KIND_LABEL[kind]}</label>
        <input id={`add-${kind}`} className={inputCls} placeholder="Nova opção…" value={adding} onChange={(e) => setAdding(e.target.value)} maxLength={80} />
        <button className={btnSecondary} disabled={busy || !adding.trim()}><Plus aria-hidden className="size-4" />Adicionar</button>
      </form>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} busy={busy} title="Remover opção" confirmLabel="Remover" onConfirm={async () => { if (del && (await run(deleteOption(del.id), "Opção removida."))) setDel(null); }}>
        <p>Vai remover <strong>{del?.label}</strong> da lista de escolha.</p>
        <p className="mt-2 text-muted">As cartas que já usam esta opção <strong>não são alteradas</strong>: o histórico mantém-se.</p>
      </ConfirmDialog>
    </section>
  );
}

export function SettingsView({ profile, options, email, cardCount }: { profile: ProfileRow; options: OptionRow[]; email: string; cardCount: number }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(profile.app_name);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function saveName() {
    setSaving(true);
    const r = await setAppName(name);
    setSaving(false);
    if (r.ok) { toast("Nome atualizado."); router.refresh(); } else toast(r.error, "error");
  }

  async function backup() {
    setDownloading(true);
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Falha (${res.status}).`);
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "backup.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast("Backup descarregado.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível criar o backup.", "error");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold md:text-2xl">Definições</h1>

      <section className="rounded-xl border border-line bg-white p-4 md:p-5">
        <h2 className="text-base font-semibold">Nome da aplicação</h2>
        <form className="mt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
          <Field label="Nome" htmlFor="app-name" className="flex-1">
            <input id="app-name" className={inputCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <button className={btnPrimary} disabled={saving || !name.trim() || name.trim() === profile.app_name}>{saving && <Spinner />}Guardar</button>
        </form>
      </section>

      {KINDS.map((k) => (
        <OptionList key={k} kind={k} items={options.filter((o) => o.kind === k)} />
      ))}

      <section className="rounded-xl border border-line bg-white p-4 md:p-5">
        <h2 className="text-base font-semibold">Backup e recuperação</h2>
        <p className="mt-1 text-sm text-muted">
          O backup é uma cópia completa para recuperação (dados em JSON e todas as fotografias, num ficheiro ZIP). É diferente dos relatórios PDF/Excel, que servem para ler e partilhar. Guarde-o fora desta aplicação.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className={btnPrimary} onClick={backup} disabled={downloading}>
            {downloading ? <Spinner /> : <Archive aria-hidden className="size-4" />}
            {downloading ? "A preparar backup…" : "Descarregar backup (ZIP)"}
          </button>
          <span className="text-sm text-muted">{cardCount} {cardCount === 1 ? "carta" : "cartas"}</span>
        </div>
        <p className="mt-3 text-xs text-muted">Procedimento de recuperação: ver <code>docs/RECUPERACAO.md</code> no projeto (restauro com <code>scripts/restore.mjs</code>).</p>
      </section>

      <section className="rounded-xl border border-line bg-white p-4 md:p-5">
        <h2 className="text-base font-semibold">Conta</h2>
        <p className="mt-1 text-sm text-muted">Sessão iniciada como <strong className="text-ink">{email}</strong>.</p>
        <form action={signOut} className="mt-3">
          <button className={btnSecondary} onClick={(e) => { void LEAVE_MESSAGE; void e; }}>Terminar sessão</button>
        </form>
      </section>
    </div>
  );
}

void formatEUR; void formatFeePercent;
