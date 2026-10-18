"use client";

export class ImageError extends Error {}

const MAX_INPUT_BYTES = 30 * 1024 * 1024;
const MAX_SIDE = 1600;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

const HEIC_HELP =
  "Não foi possível ler esta fotografia HEIC neste navegador. No iPhone, use Definições › Câmara › Formatos › “Mais compatível”, ou escolha a fotografia a partir da Galeria (é convertida automaticamente), ou converta-a para JPEG.";

function isHeic(file: File) {
  return /hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type);
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // "from-image" aplica a orientação EXIF (fotografias de telemóvel ficam direitas).
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Alternativa: <img> (os navegadores modernos aplicam EXIF por defeito).
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }
}

/**
 * Valida, corrige a orientação e comprime para JPEG (lado maior ≤ 1600 px), sem cortar.
 * Lança ImageError com mensagem em português para formatos/ficheiros inválidos.
 */
export async function prepareImage(file: File): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) throw new ImageError("A fotografia é demasiado grande (máximo 30 MB).");
  const heic = isHeic(file);
  if (!heic && !ACCEPTED.includes(file.type)) {
    throw new ImageError("Formato não suportado. Use JPEG, PNG ou WebP.");
  }

  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await decode(file);
  } catch {
    throw new ImageError(heic ? HEIC_HELP : "Não foi possível ler a fotografia. O ficheiro pode estar danificado.");
  }

  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  if (!w || !h) throw new ImageError("Fotografia inválida.");
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("Este navegador não consegue processar imagens.");
  ctx.fillStyle = "#ffffff"; // PNG/WebP com transparência ficam sobre branco no JPEG
  ctx.fillRect(0, 0, cw, ch);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, cw, ch);
  if ("close" in src) src.close();

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  if (!blob) throw new ImageError("Não foi possível comprimir a fotografia.");
  if (blob.size > 5 * 1024 * 1024) throw new ImageError("A fotografia continua demasiado grande após compressão.");
  return blob;
}
