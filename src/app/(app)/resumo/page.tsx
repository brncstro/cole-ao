import Link from "next/link";
import { loadWorkspace } from "@/lib/data";
import { summarize } from "@/lib/summary";
import { formatEUR, formatPercent, formatSignedEUR } from "@/lib/money";
import { Badge, Empty, btnPrimary } from "@/components/ui";

export const metadata = { title: "Resumo" };

function Row({ label, value, strong, note }: { label: string; value: React.ReactNode; strong?: boolean; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <dt className="text-sm">
        {label}
        {note && <span className="block text-xs text-muted">{note}</span>}
      </dt>
      <dd className={`tabular text-right text-sm ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

function Block({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-4 md:p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {badge}
      </div>
      <dl>{children}</dl>
    </section>
  );
}

const tone = (c: number) => (c > 0 ? "text-pos" : c < 0 ? "text-neg" : "");

export default async function SummaryPage() {
  const { cards } = await loadWorkspace();
  if (cards.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold md:text-2xl">Resumo</h1>
        <Empty title="Sem dados para resumir" action={<Link href="/cartas/nova" className={btnPrimary}>Adicionar carta</Link>}>
          O resumo aparece assim que registar a primeira carta.
        </Empty>
      </div>
    );
  }
  const s = summarize(cards);
  const profit = (c: number) => <span className={`font-semibold ${tone(c)}`}>{formatSignedEUR(c)}</span>;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold md:text-2xl">Resumo</h1>
      <p className="mt-1 text-sm text-muted">Valores realizados (vendas concluídas) estão separados das estimativas (cartas ainda não vendidas).</p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Block title="Cartas">
          <Row label="Total de cartas" value={s.count} strong />
          <Row label="Em coleção" value={s.countCollection} />
          <Row label="À venda" value={s.countForSale} />
          <Row label="Vendidas" value={s.countSold} />
        </Block>

        <Block title="Compras e custos">
          <Row label="Total gasto em compras" value={formatEUR(s.totalPurchases)} />
          <Row label="Total gasto em portes de compra" value={formatEUR(s.totalPurchaseShipping)} />
          <Row label="Custo total da coleção registada" value={formatEUR(s.totalCost)} strong />
          <Row label="Custo das cartas ainda não vendidas" value={formatEUR(s.unsoldCost)} />
        </Block>

        <Block title="Vendas realizadas" badge={<Badge tone="accent">Realizado</Badge>}>
          <Row label="Receita bruta" value={formatEUR(s.revenue)} />
          <Row label="Custo das cartas vendidas" value={formatEUR(s.soldCost)} />
          <Row label="Taxas efetivas" value={formatEUR(s.fees)} />
          <Row label="Portes de venda" value={formatEUR(s.saleShipping)} />
          <Row label="Embalagens" value={formatEUR(s.packaging)} />
          <Row label="Lucro realizado" value={profit(s.realizedProfit)} strong />
          <Row label="Margem global realizada" note="Lucro realizado ÷ custo das cartas vendidas" value={s.countSold === 0 ? "—" : formatPercent(s.realizedMargin)} />
        </Block>

        <Block title="Estimativas (não vendidas)" badge={<Badge tone="muted">Estimado</Badge>}>
          <Row label="À venda — valor previsto" note={`${s.forSale.withEstimate} de ${s.forSale.count} com estimativa`} value={formatEUR(s.forSale.expectedValue)} />
          <Row label="À venda — lucro estimado" value={profit(s.forSale.estimatedProfit)} />
          <Row label="Em coleção — valor previsto" note={`${s.inCollection.withEstimate} de ${s.inCollection.count} com estimativa`} value={formatEUR(s.inCollection.expectedValue)} />
          <Row label="Em coleção — lucro estimado" value={profit(s.inCollection.estimatedProfit)} />
          <Row label="Cartas sem estimativa" note="Sem preço previsto; não entram nos valores acima" value={s.noEstimateCount} />
        </Block>
      </div>

      <section className="mt-4 rounded-xl border border-line-strong bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Lucro total <span className="font-normal text-muted">(realizado + estimado)</span></h2>
            <p className="text-xs text-muted">Soma do lucro realizado com os lucros estimados. Não é dinheiro já ganho: só a parte realizada o é.</p>
          </div>
          <p className="tabular text-lg font-semibold">{profit(s.totalProfitMixed)}</p>
        </div>
      </section>
    </div>
  );
}
