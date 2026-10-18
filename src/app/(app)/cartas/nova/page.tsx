import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/data";
import { emptyInput } from "@/lib/card-input";
import { CardForm } from "@/components/CardForm";
import type { OptionRow } from "@/lib/types";

export const metadata = { title: "Adicionar carta" };

export default async function NewCardPage() {
  const { supabase, user } = await requireUser();
  await supabase.rpc("bootstrap_user");
  const { data } = await supabase.from("options").select("*").order("sort_order").order("label");
  return <CardForm initial={emptyInput(randomUUID())} isNew userId={user.id} options={(data ?? []) as OptionRow[]} />;
}
