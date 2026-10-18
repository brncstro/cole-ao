"use client";

import { btnPrimary } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-lg font-semibold">Algo correu mal</h1>
      <p className="mt-2 text-sm text-muted">Não foi possível carregar esta página. Os seus dados não foram alterados.</p>
      <p className="mt-2 break-words text-xs text-muted">{error.message}</p>
      <button className={`${btnPrimary} mt-5`} onClick={reset}>
        Tentar novamente
      </button>
    </div>
  );
}
