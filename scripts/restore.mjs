#!/usr/bin/env node
/**
 * Restaura um backup (ZIP descarregado em Definições › Backup) para um utilizador existente.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/restore.mjs backup-colecao-2026-10-18.zip utilizador@email.pt [--dry-run] [--replace]
 *
 * - O utilizador de destino tem de existir (crie a conta na app primeiro).
 * - Por defeito NÃO sobrescreve: se o destino já tiver cartas, o script pára. Use --replace para apagar
 *   primeiro todas as cartas e fotografias desse utilizador (irreversível).
 * - A chave service_role ignora a RLS: use-a apenas localmente, nunca no browser nem em produção.
 */
import fs from "node:fs";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import { upgradeBackup } from "./backup-compat.mjs";

const [zipPath, email, ...flags] = process.argv.slice(2);
const dry = flags.includes("--dry-run");
const replace = flags.includes("--replace");
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!zipPath || !email || !url || !key) {
  console.error("Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/restore.mjs <backup.zip> <email> [--dry-run] [--replace]");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
const raw = JSON.parse(await zip.file("data.json").async("string"));
const data = upgradeBackup(raw); // aceita backups v1 (antes dos portes cobrados) e v2
if (raw.version !== data.version) console.log(`Backup versão ${raw.version} atualizado em memória para a versão ${data.version} (portes cobrados = 0).`);

// localizar utilizador
let user = null;
for (let page = 1; !user; page++) {
  const { data: list, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (list.users.length < 200) break;
}
if (!user) throw new Error(`Utilizador ${email} não encontrado. Crie a conta primeiro.`);
const uid = user.id;

console.log(`Backup de ${data.exportedAt}: ${data.cards.length} cartas, ${data.options.length} opções, ${data.counts.photos} fotografias.`);
if (data.missingPhotos?.length) console.warn(`Aviso: ${data.missingPhotos.length} fotografias não estavam acessíveis no momento do backup.`);

const { count } = await sb.from("cards").select("id", { count: "exact", head: true }).eq("user_id", uid);
if (count && !replace) throw new Error(`O utilizador já tem ${count} cartas. Use --replace para as apagar primeiro, ou restaure para outra conta.`);
if (dry) { console.log("--dry-run: nada foi alterado."); process.exit(0); }

if (replace && count) {
  const { data: old } = await sb.from("cards").select("front_path,back_path").eq("user_id", uid);
  const paths = (old ?? []).flatMap((c) => [c.front_path, c.back_path]).filter(Boolean);
  for (let i = 0; i < paths.length; i += 100) await sb.storage.from("card-photos").remove(paths.slice(i, i + 100));
  const { error } = await sb.from("cards").delete().eq("user_id", uid);
  if (error) throw error;
}

await sb.from("profiles").upsert({ user_id: uid, app_name: data.appName });

// opções
await sb.from("options").delete().eq("user_id", uid);
for (let i = 0; i < data.options.length; i += 200) {
  const rows = data.options.slice(i, i + 200).map(({ id, created_at, ...o }) => ({ ...o, user_id: uid }));
  const { error } = await sb.from("options").insert(rows);
  if (error) throw error;
}

// fotografias
let up = 0;
for (const name of Object.keys(zip.files).filter((n) => n.startsWith("photos/") && !zip.files[n].dir)) {
  const rel = name.slice("photos/".length);
  const buf = await zip.file(name).async("nodebuffer");
  const { error } = await sb.storage.from("card-photos").upload(`${uid}/${rel}`, buf, { contentType: "image/jpeg", upsert: true });
  if (error) console.warn(`Falhou ${rel}: ${error.message}`); else up++;
}

// cartas (preserva ids e referências)
let max = 0;
for (let i = 0; i < data.cards.length; i += 200) {
  const rows = data.cards.slice(i, i + 200).map((c) => ({
    ...c,
    user_id: uid,
    front_path: c.front_path ? `${uid}/${c.front_path}` : null,
    back_path: c.back_path ? `${uid}/${c.back_path}` : null,
  }));
  const { error } = await sb.from("cards").insert(rows);
  if (error) throw error;
}
for (const c of data.cards) max = Math.max(max, Number(/^C-(\d+)$/.exec(c.ref)?.[1] ?? 0));
await sb.from("profiles").update({ next_ref: max + 1 }).eq("user_id", uid);

console.log(`Restauro concluído: ${data.cards.length} cartas, ${up} fotografias.`);
