import JSZip from "jszip";
import { NextResponse } from "next/server";
import { fetchAllCards, PHOTO_BUCKET, requireUser } from "@/lib/data";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Backup completo para recuperação: dados (JSON) + todas as fotografias.
 * Formato documentado em docs/RECUPERACAO.md; restauro com scripts/restore.mjs.
 */
export async function GET() {
  const { supabase, user } = await requireUser();
  const [cards, options, profile] = await Promise.all([
    fetchAllCards(supabase),
    supabase.from("options").select("*").order("sort_order"),
    supabase.from("profiles").select("app_name").eq("user_id", user.id).single(),
  ]);
  if (options.error) return NextResponse.json({ error: "Não foi possível ler as definições." }, { status: 500 });

  const zip = new JSZip();
  const missing: string[] = [];
  let photoCount = 0;
  const paths = cards.flatMap((c) => [c.front_path, c.back_path]).filter((p): p is string => !!p && p.startsWith(`${user.id}/`));

  for (let i = 0; i < paths.length; i += 6) {
    await Promise.all(
      paths.slice(i, i + 6).map(async (p) => {
        const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(p);
        if (error || !data) { missing.push(p); return; }
        zip.file(`photos/${p.slice(user.id.length + 1)}`, Buffer.from(await data.arrayBuffer()));
        photoCount++;
      }),
    );
  }

  const exportedAt = new Date().toISOString();
  zip.file(
    "data.json",
    JSON.stringify(
      {
        format: "minha-colecao-backup",
        version: 2,
        exportedAt,
        appName: profile.data?.app_name ?? "A Minha Coleção",
        counts: { cards: cards.length, options: options.data?.length ?? 0, photos: photoCount, missingPhotos: missing.length },
        // Os caminhos das fotografias são relativos ("<id-da-carta>/frente-xxx.jpg"); o restauro volta a prefixá-los com o id do utilizador de destino.
        cards: cards.map((c) => ({
          ...c,
          user_id: undefined,
          front_path: c.front_path?.slice(user.id.length + 1) ?? null,
          back_path: c.back_path?.slice(user.id.length + 1) ?? null,
        })),
        options: (options.data ?? []).map((o) => ({ ...o, user_id: undefined })),
        missingPhotos: missing,
      },
      null,
      2,
    ),
  );
  zip.file("LEIA-ME.txt", "Backup de A Minha Coleção.\n\n- data.json: todas as cartas e definições.\n- photos/: fotografias (caminho relativo igual ao guardado em data.json).\n\nRecuperação: ver docs/RECUPERACAO.md e scripts/restore.mjs no projeto.\nEste backup contém dados privados — guarde-o em local seguro.\n");

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="backup-colecao-${exportedAt.slice(0, 10)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
