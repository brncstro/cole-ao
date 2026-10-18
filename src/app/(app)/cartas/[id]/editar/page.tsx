import { notFound } from "next/navigation";
import { requireUser } from "@/lib/data";
import { cardToInput } from "@/lib/card-input";
import { CardForm } from "@/components/CardForm";
import type { CardRow, OptionRow } from "@/lib/types";

export const metadata = { title: "Editar carta" };

export default async function EditCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const [card, options] = await Promise.all([
    supabase.from("cards").select("*").eq("id", id).maybeSingle(),
    supabase.from("options").select("*").order("sort_order").order("label"),
  ]);
  if (!card.data) notFound();
  const row = card.data as CardRow;
  return <CardForm initial={cardToInput(row)} isNew={false} userId={user.id} options={(options.data ?? []) as OptionRow[]} cardRef={row.ref} />;
}
