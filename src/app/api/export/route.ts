import { NextResponse, type NextRequest } from "next/server";
import { fetchAllCards, PHOTO_BUCKET, requireUser } from "@/lib/data";
import { applyQuery, describeFilters, EMPTY_FILTERS, SORT_LABEL, type Filters, type Sort } from "@/lib/search";
import { formatDate, formatEUR } from "@/lib/money";
import { summarize } from "@/lib/summary";
import { buildPdf } from "@/lib/export/pdf";
import { buildXlsx } from "@/lib/export/xlsx";
import { toExportRow, type ExportMeta } from "@/lib/export/rows";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeFilters(f: Partial<Filters> | undefined): Filters {
  const e = EMPTY_FILTERS;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 100) : []);
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 200) : "");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
  const statuses = arr(f?.statuses).filter((s): s is Filters["statuses"][number] => ["collection", "for_sale", "sold"].includes(s));
  return {
    ...e,
    q: str(f?.q),
    field: (typeof f?.field === "string" ? f.field : "all") as Filters["field"],
    sets: arr(f?.sets), categories: arr(f?.categories), conditions: arr(f?.conditions), statuses,
    sources: arr(f?.sources), platforms: arr(f?.platforms),
    purchaseFrom: str(f?.purchaseFrom), purchaseTo: str(f?.purchaseTo), saleFrom: str(f?.saleFrom), saleTo: str(f?.saleTo),
    costMin: num(f?.costMin), costMax: num(f?.costMax), saleMin: num(f?.saleMin), saleMax: num(f?.saleMax),
    purchasePriceMin: num(f?.purchasePriceMin), purchasePriceMax: num(f?.purchasePriceMax),
    profitSign: f?.profitSign === "positive" || f?.profitSign === "negative" ? f.profitSign : "any",
  };
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await requireUser();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const format = body.format === "xlsx" ? "xlsx" : body.format === "pdf" ? "pdf" : null;
  const scope = ["all", "filtered", "selected"].includes(body.scope) ? (body.scope as "all" | "filtered" | "selected") : null;
  if (!format || !scope) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });

  // Dados lidos do servidor (RLS garante que só vêm cartas do utilizador): pesquisa e exportação abrangem a coleção completa.
  const [all, profile] = await Promise.all([
    fetchAllCards(supabase),
    supabase.from("profiles").select("app_name").eq("user_id", user.id).single(),
  ]);
  const appName: string = profile.data?.app_name ?? "A Minha Coleção";

  const sort: Sort = {
    key: typeof body.sort?.key === "string" && body.sort.key in SORT_LABEL ? body.sort.key : "created",
    dir: body.sort?.dir === "asc" ? "asc" : "desc",
  };
  const filters = sanitizeFilters(body.filters);
  const fmt = { date: formatDate, money: (c: number) => formatEUR(c).replace(/ /g, " ") };

  let cards = applyQuery(all, scope === "filtered" ? filters : EMPTY_FILTERS, sort);
  let scopeLabel = "Toda a coleção";
  let filterLabels: string[] = [];
  if (scope === "filtered") {
    filterLabels = describeFilters(filters, fmt).map((f) => f.label);
    scopeLabel = filterLabels.length ? "Resultados da pesquisa e filtros" : "Toda a coleção (sem filtros)";
  } else if (scope === "selected") {
    const ids = new Set((Array.isArray(body.ids) ? body.ids : []).filter((i: unknown): i is string => typeof i === "string" && UUID.test(i)));
    cards = cards.filter((c) => ids.has(c.id));
    scopeLabel = "Cartas selecionadas";
  }
  if (cards.length === 0) return NextResponse.json({ error: "Não há cartas para exportar com esta seleção." }, { status: 422 });

  const rows = cards.map(toExportRow);
  const summary = body.options?.summary === false ? null : summarize(cards);
  const meta: ExportMeta = { appName, exportedAt: new Date(), scopeLabel, filters: filterLabels, sortLabel: `${SORT_LABEL[sort.key]} (${sort.dir === "asc" ? "crescente" : "decrescente"})`, count: rows.length };
  const stamp = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });

  try {
    if (format === "xlsx") {
      const buf = await buildXlsx({ rows, summary, meta });
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="colecao-${stamp}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const thumbnails = body.options?.thumbnails === true;
    const buf = await buildPdf({
      rows, summary, meta,
      options: { summary: summary != null, thumbnails, pageSize: body.options?.pageSize === "A4" ? "A4" : "A3" },
      loadImage: thumbnails
        ? async (p) => {
            if (!p.startsWith(`${user.id}/`)) return null;
            const { data } = await supabase.storage.from(PHOTO_BUCKET).download(p);
            return data ? Buffer.from(await data.arrayBuffer()) : null;
          }
        : undefined,
    });
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="colecao-${stamp}.pdf"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("export failed", e);
    return NextResponse.json({ error: "Não foi possível gerar o ficheiro. Tente novamente." }, { status: 500 });
  }
}
