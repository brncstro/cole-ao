"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "./supabase/client";

const BUCKET = "card-photos";
const TTL = 3600; // segundos
const cache = new Map<string, { url: string; exp: number }>();

/** URLs temporários (1 h) para fotografias privadas. Faz pedidos em lote e guarda em cache. */
export function useSignedUrls(paths: (string | null | undefined)[]) {
  const [, bump] = useState(0);
  const key = useMemo(() => Array.from(new Set(paths.filter((p): p is string => !!p))).sort().join("|"), [paths]);

  useEffect(() => {
    const now = Date.now();
    const need = key ? key.split("|").filter((p) => !(cache.get(p)?.exp! > now + 60_000)) : [];
    if (!need.length) return;
    let cancelled = false;
    (async () => {
      const supabase = supabaseBrowser();
      for (let i = 0; i < need.length; i += 100) {
        const chunk = need.slice(i, i + 100);
        const { data } = await supabase.storage.from(BUCKET).createSignedUrls(chunk, TTL);
        for (const row of data ?? []) {
          if (row.path && row.signedUrl) cache.set(row.path, { url: row.signedUrl, exp: Date.now() + TTL * 1000 });
        }
      }
      if (!cancelled) bump((n) => n + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return (path: string | null | undefined): string | null => {
    if (!path) return null;
    const hit = cache.get(path);
    return hit && hit.exp > Date.now() ? hit.url : null;
  };
}

/** Invalida a cache de um caminho (após substituir/remover). */
export function forgetSignedUrl(path: string) {
  cache.delete(path);
}
