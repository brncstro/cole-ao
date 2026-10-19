"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, PHOTO_BUCKET } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import { cardToInput, validateCardInput, type CardInput } from "@/lib/card-input";
import { parseDecimal, parseMoney } from "@/lib/money";
import type { CardRow, OptionKind } from "@/lib/types";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; errors?: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPTION_KINDS: OptionKind[] = ["set", "category", "condition", "source", "platform"];

const fail = (error: string, errors?: Record<string, string>) => ({ ok: false as const, error, errors });

// ------------------------------------------------------------------ autenticação
export async function signIn(_: unknown, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return fail("Indique o email e a palavra-passe.");
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return fail("Email ou palavra-passe incorretos.");
  redirect("/");
}

export async function signUp(_: unknown, form: FormData): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !email.includes("@")) return fail("Indique um email válido.");
  if (password.length < 8) return fail("A palavra-passe deve ter pelo menos 8 caracteres.");
  const supabase = await supabaseServer();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: origin ? { emailRedirectTo: `${origin}/auth/callback` } : undefined,
  });
  if (error) return fail(error.message.includes("not allowed") || error.message.toLowerCase().includes("signups") ? "O registo está desativado." : "Não foi possível criar a conta. Tente novamente.");
  if (data.session) redirect("/");
  return { ok: true, data: { needsConfirmation: true } };
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}

// ------------------------------------------------------------------ cartas
async function ensureOptions(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
  v: { set_name: string | null; category: string | null; purchase_source: string | null; sale_platform: string | null },
) {
  const rows: { user_id: string; kind: OptionKind; label: string }[] = [];
  if (v.set_name) rows.push({ user_id: userId, kind: "set", label: v.set_name });
  if (v.category) rows.push({ user_id: userId, kind: "category", label: v.category });
  if (v.purchase_source) rows.push({ user_id: userId, kind: "source", label: v.purchase_source });
  if (v.sale_platform) rows.push({ user_id: userId, kind: "platform", label: v.sale_platform });
  if (rows.length) await supabase.from("options").upsert(rows, { onConflict: "user_id,kind,label", ignoreDuplicates: true });
}

async function removePhotos(supabase: Awaited<ReturnType<typeof supabaseServer>>, paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (list.length) await supabase.storage.from(PHOTO_BUCKET).remove(list);
}

export async function saveCard(input: CardInput, isNew: boolean): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser();
  if (!UUID.test(input.id)) return fail("Identificador inválido.");
  const result = validateCardInput(input, `${user.id}/${input.id}/`);
  if (!result.ok) return fail("Corrija os campos assinalados.", result.errors);
  const value = result.value;

  if (isNew) {
    const { error } = await supabase.from("cards").insert({ id: input.id, user_id: user.id, ...value });
    if (error) return fail("Não foi possível guardar a carta. Os dados continuam no formulário; tente novamente.");
  } else {
    const { data: old, error: e1 } = await supabase.from("cards").select("front_path,back_path").eq("id", input.id).maybeSingle();
    if (e1 || !old) return fail("Carta não encontrada.");
    const { error } = await supabase.from("cards").update(value).eq("id", input.id);
    if (error) return fail("Não foi possível guardar as alterações. Os dados continuam no formulário; tente novamente.");
    // Remove ficheiros substituídos ou removidos (só depois de a gravação ter sucesso).
    await removePhotos(supabase, [
      old.front_path && old.front_path !== value.front_path ? old.front_path : null,
      old.back_path && old.back_path !== value.back_path ? old.back_path : null,
    ]);
  }
  await ensureOptions(supabase, user.id, value);
  revalidatePath("/", "layout");
  return { ok: true, data: { id: input.id } };
}

export async function deleteCard(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!UUID.test(id)) return fail("Identificador inválido.");
  const { data: card } = await supabase.from("cards").select("front_path,back_path").eq("id", id).maybeSingle();
  if (!card) return fail("Carta não encontrada.");
  const { error } = await supabase.from("cards").delete().eq("id", id);
  if (error) return fail("Não foi possível eliminar a carta.");
  await removePhotos(supabase, [card.front_path, card.back_path]);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function deleteCards(ids: string[]): Promise<ActionResult<{ deleted: number }>> {
  const { supabase } = await requireUser();
  const valid = ids.filter((i) => UUID.test(i));
  if (!valid.length) return fail("Nada selecionado.");
  const { data: cards } = await supabase.from("cards").select("id,front_path,back_path").in("id", valid);
  const found = cards ?? [];
  if (!found.length) return fail("Cartas não encontradas.");
  const { error } = await supabase.from("cards").delete().in("id", found.map((c) => c.id));
  if (error) return fail("Não foi possível eliminar as cartas.");
  await removePhotos(supabase, found.flatMap((c) => [c.front_path, c.back_path]));
  revalidatePath("/", "layout");
  return { ok: true, data: { deleted: found.length } };
}

/** Nova referência; limpa dados de venda e fotografias para evitar associações acidentais. */
export async function duplicateCard(id: string): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireUser();
  if (!UUID.test(id)) return fail("Identificador inválido.");
  const { data: src } = await supabase.from("cards").select("*").eq("id", id).maybeSingle();
  if (!src) return fail("Carta não encontrada.");
  const c = src as CardRow;
  const { data, error } = await supabase
    .from("cards")
    .insert({
      user_id: user.id,
      name: c.name,
      set_name: c.set_name,
      card_number: c.card_number,
      category: c.category,
      language: c.language,
      condition: c.condition,
      grading_company: c.grading_company,
      grading_grade: c.grading_grade,
      notes: c.notes,
      purchase_source: c.purchase_source,
      purchase_date: c.purchase_date,
      purchase_price_cents: c.purchase_price_cents,
      purchase_shipping_cents: c.purchase_shipping_cents,
      status: "collection",
    })
    .select("id")
    .single();
  if (error || !data) return fail("Não foi possível duplicar a carta.");
  revalidatePath("/", "layout");
  return { ok: true, data: { id: data.id } };
}

/** Muda a situação (e, se for “Vendida”, grava preço final e data na mesma operação). */
export async function setCardStatus(id: string, patch: Partial<CardInput>): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!UUID.test(id)) return fail("Identificador inválido.");
  const { data: row } = await supabase.from("cards").select("*").eq("id", id).maybeSingle();
  if (!row) return fail("Carta não encontrada.");
  const merged: CardInput = { ...cardToInput(row as CardRow), ...patch, id };
  const result = validateCardInput(merged, `${user.id}/${id}/`);
  if (!result.ok) return fail("Corrija os campos assinalados.", result.errors);
  const { error } = await supabase.from("cards").update(result.value).eq("id", id);
  if (error) return fail("Não foi possível mudar a situação.");
  await ensureOptions(supabase, user.id, result.value);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

// ------------------------------------------------------------------ definições
export async function setAppName(name: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const n = name.trim();
  if (!n || n.length > 60) return fail("O nome deve ter entre 1 e 60 caracteres.");
  const { error } = await supabase.from("profiles").update({ app_name: n }).eq("user_id", user.id);
  if (error) return fail("Não foi possível guardar o nome.");
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function addOption(kind: OptionKind, label: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const l = label.trim();
  if (!OPTION_KINDS.includes(kind)) return fail("Tipo inválido.");
  if (!l || l.length > 80) return fail("Indique um nome com até 80 caracteres.");
  const { error } = await supabase.from("options").insert({ user_id: user.id, kind, label: l });
  if (error) return fail(error.code === "23505" ? "Já existe uma opção com esse nome." : "Não foi possível adicionar.");
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function renameOption(kind: OptionKind, oldLabel: string, newLabel: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const l = newLabel.trim();
  if (!OPTION_KINDS.includes(kind)) return fail("Tipo inválido.");
  if (!l || l.length > 80) return fail("Indique um nome com até 80 caracteres.");
  if (l === oldLabel) return { ok: true, data: undefined };
  const { error } = await supabase.rpc("rename_option", { p_kind: kind, p_old: oldLabel, p_new: l });
  if (error) return fail(error.code === "23505" ? "Já existe uma opção com esse nome." : "Não foi possível renomear.");
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Remover uma opção não altera as cartas: estas guardam o texto escolhido. */
export async function deleteOption(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!UUID.test(id)) return fail("Identificador inválido.");
  const { error } = await supabase.from("options").delete().eq("id", id);
  if (error) return fail("Não foi possível remover.");
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

/** Altera as taxas (e se a % incide sobre os portes cobrados) de uma plataforma. Só afeta vendas futuras: as cartas já guardam a sua própria cópia. */
export async function updatePlatformFees(id: string, percent: string, fixed: string, feeOnShipping: boolean): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!UUID.test(id)) return fail("Identificador inválido.");
  const p = parseDecimal(percent);
  const f = parseMoney(fixed);
  if (!p.ok) return fail(`Taxa percentual: ${p.error}`);
  if (!f.ok) return fail(`Taxa fixa: ${f.error}`);
  const { error } = await supabase
    .from("options")
    .update({ fee_percent: p.value, fee_fixed_cents: f.cents, fee_on_shipping: !!feeOnShipping, fee_is_example: false })
    .eq("id", id)
    .eq("kind", "platform");
  if (error) return fail("Não foi possível guardar as taxas.");
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
