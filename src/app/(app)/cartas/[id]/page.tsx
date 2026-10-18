import { notFound } from "next/navigation";
import { requireUser } from "@/lib/data";
import { CardDetail } from "@/components/CardDetail";
import type { CardRow, OptionRow } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("cards").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Carta" };
}

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [card, options] = await Promise.all([
    supabase.from("cards").select("*").eq("id", id).maybeSingle(),
    supabase.from("options").select("*").order("sort_order").order("label"),
  ]);
  if (!card.data) notFound();
  return <CardDetail card={card.data as CardRow} options={(options.data ?? []) as OptionRow[]} />;
}
