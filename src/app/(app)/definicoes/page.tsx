import { loadWorkspace } from "@/lib/data";
import { SettingsView } from "@/components/SettingsView";

export const metadata = { title: "Definições" };

export default async function SettingsPage() {
  const { profile, options, user, cards } = await loadWorkspace();
  return <SettingsView profile={profile} options={options} email={user.email ?? ""} cardCount={cards.length} />;
}
