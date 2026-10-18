import Link from "next/link";
import { btnPrimary } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-lg font-semibold">Carta não encontrada</h1>
      <p className="mt-2 text-sm text-muted">Pode ter sido eliminada ou não existir na sua coleção.</p>
      <Link href="/" className={`${btnPrimary} mt-5`}>Voltar à coleção</Link>
    </div>
  );
}
