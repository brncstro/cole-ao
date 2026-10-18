import { loadWorkspace } from "@/lib/data";
import { CollectionView } from "@/components/CollectionView";

export const metadata = { title: "Coleção" };

export default async function CollectionPage() {
  const { cards, options, profile } = await loadWorkspace();
  return <CollectionView cards={cards} options={options} appName={profile.app_name} />;
}
