import { requireUser } from "@/lib/data";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  await supabase.rpc("bootstrap_user");
  const { data } = await supabase.from("profiles").select("app_name").eq("user_id", user.id).single();
  return <Shell appName={data?.app_name ?? "A Minha Coleção"}>{children}</Shell>;
}
