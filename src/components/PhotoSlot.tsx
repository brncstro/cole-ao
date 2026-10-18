"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { ImageError, IMAGE_ACCEPT, prepareImage } from "@/lib/image";
import { supabaseBrowser } from "@/lib/supabase/client";
import { forgetSignedUrl, useSignedUrls } from "@/lib/use-signed-urls";
import { Spinner, btnSecondary } from "./ui";
import { Thumb } from "./bits";

type Stage = "idle" | "preparing" | "uploading" | "error";

export function PhotoSlot({
  label,
  side,
  path,
  userId,
  cardId,
  onChange,
  onUploaded,
  error,
}: {
  label: string;
  side: "front" | "back";
  path: string;
  userId: string;
  cardId: string;
  onChange: (path: string) => void;
  onUploaded: (path: string) => void;
  error?: string;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const pending = useRef<Blob | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const urlFor = useSignedUrls([path]);

  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);

  async function upload(blob: Blob) {
    setStage("uploading");
    setMsg(null);
    const newPath = `${userId}/${cardId}/${side}-${Date.now().toString(36)}.jpg`;
    const { error: err } = await supabaseBrowser().storage.from("card-photos").upload(newPath, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
    if (err) {
      pending.current = blob; // mantém a fotografia preparada para tentar de novo sem perder nada
      setStage("error");
      setMsg("Não foi possível enviar a fotografia. Verifique a ligação e tente novamente. O resto do formulário não foi afetado.");
      return;
    }
    pending.current = null;
    forgetSignedUrl(newPath);
    onUploaded(newPath);
    onChange(newPath);
    setLocalUrl(null);
    setStage("idle");
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    setStage("preparing");
    try {
      const blob = await prepareImage(file);
      setLocalUrl(URL.createObjectURL(blob)); // pré-visualização imediata
      await upload(blob);
    } catch (e) {
      setStage("error");
      pending.current = null;
      setLocalUrl(null);
      setMsg(e instanceof ImageError ? e.message : "Não foi possível processar a fotografia.");
    }
  }

  const busy = stage === "preparing" || stage === "uploading";
  const shownUrl = localUrl ?? urlFor(path);
  const hasPhoto = !!path || !!localUrl;

  return (
    <div className="min-w-0">
      <p className="mb-1 text-sm font-medium">{label}</p>
      <div className="relative">
        <Thumb url={shownUrl} alt={hasPhoto ? `${label} da carta` : ""} className="aspect-[5/7] w-full" />
        {busy && (
          <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-white/80 text-sm">
            <Spinner className="size-5" />
            <span>{stage === "preparing" ? "A preparar (1/2)…" : "A enviar (2/2)…"}</span>
            <div className="h-1.5 w-2/3 overflow-hidden rounded-full bg-line"><div className={`h-full bg-accent transition-all ${stage === "preparing" ? "w-1/3" : "w-4/5"}`} /></div>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <input ref={galleryRef} type="file" accept={IMAGE_ACCEPT} className="sr-only" tabIndex={-1} aria-label={`${label}: escolher da galeria`} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label={`${label}: tirar fotografia`} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" className={`${btnSecondary} !min-h-9 !px-2.5`} disabled={busy} onClick={() => galleryRef.current?.click()}>
          <ImagePlus aria-hidden className="size-4" />
          {hasPhoto ? "Substituir" : "Galeria"}
        </button>
        <button type="button" className={`${btnSecondary} !min-h-9 !px-2.5 md:hidden`} disabled={busy} onClick={() => cameraRef.current?.click()}>
          <Camera aria-hidden className="size-4" />
          Câmara
        </button>
        {path && !busy && (
          <button type="button" className={`${btnSecondary} !min-h-9 !px-2.5 text-neg`} onClick={() => { onChange(""); setMsg(null); setStage("idle"); }}>
            <Trash2 aria-hidden className="size-4" />
            Remover
          </button>
        )}
      </div>

      {(msg || error) && (
        <div role="alert" className="mt-2 rounded-lg bg-[#fbeceb] px-3 py-2 text-xs text-neg">
          {msg ?? error}
          {stage === "error" && pending.current && (
            <button type="button" className="mt-1 flex items-center gap-1 font-medium underline" onClick={() => upload(pending.current!)}>
              <RefreshCw aria-hidden className="size-3" /> Tentar novamente
            </button>
          )}
        </div>
      )}
      {stage === "uploading" || stage === "preparing" ? null : <p className="mt-1.5 text-xs text-muted">JPEG, PNG ou WebP. É comprimida e endireitada sem cortar a carta.</p>}
    </div>
  );
}
