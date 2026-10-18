import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import type { CardRow, OptionRow, ProfileRow } from "./types";

export const PHOTO_BUCKET = "card-photos";
const PAGE_SIZE = 1000; // o PostgREST do Supabase limita cada pedido (por defeito 1000 linhas)

/** Lê TODAS as cartas do utilizador, em páginas, para a pesquisa/exportação abrangerem a coleção completa. */
export async function fetchAllCards(supabase: Awaited<ReturnType<typeof supabaseServer>>): Promise<CardRow[]> {
  const all: CardRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("cards")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Cartas: ${error.message}`);
    all.push(...(data as CardRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return all;
}

export async function requireUser() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase, user: data.user };
}

/** Carrega perfil (criando-o e às opções iniciais na primeira vez), opções e todas as cartas do utilizador. */
export async function loadWorkspace() {
  const { supabase, user } = await requireUser();
  await supabase.rpc("bootstrap_user");
  const [profile, options, cards] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("options").select("*").order("sort_order").order("label"),
    fetchAllCards(supabase),
  ]);
  if (profile.error) throw new Error(`Perfil: ${profile.error.message}`);
  if (options.error) throw new Error(`Opções: ${options.error.message}`);
  return {
    supabase,
    user,
    profile: profile.data as ProfileRow,
    options: options.data as OptionRow[],
    cards,
  };
}
