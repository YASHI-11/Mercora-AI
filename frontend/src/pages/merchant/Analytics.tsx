import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../lib/api'
import { LoadingState } from '../../components/StateViews'
import { Panel, TipCard } from '../../components/merchant/ui'
import { CHART, axisINR, type TipProps } from '../../components/merchant/theme'
import { formatINR, formatINRCompact } from '../../hooks/useCatalog'
import type { Product } from '../../types'

type CategoryRow = { category: string; revenue: number; units_sold: number; product_count: number }
type Segment = { name: string; size: number; avg_total_spent: number; avg_frequency: number; avg_recency_days: number }

export default function Analytics() {
  const { data: categories, isLoading: loadingCat } = useQuery({
    queryKey: ['category-performance'],
    queryFn: async () => (await api.get<{ categories: CategoryRow[] }>('/merchant/analytics/categories')).data,
  })
  const { data: products, isLoading: loadingProd } = useQuery({
    queryKey: ['product-analytics'],
    queryFn: async () => (await api.get<{ top_products: Product[]; low_conversion_products: Product[] }>('/merchant/analytics/products')).data,
  })
  const { data: segments } = useQuery({
    queryKey: ['segments'],
    queryFn: async () => (await api.get<{ segments: Segment[]; silhouette_score: number | null }>('/merchant/analytics/segments')).data,
  })

  if (loadingCat || loadingProd) return <LoadingState label="Loading analytics…" />

  const cats = [...(categories?.categories ?? [])].sort((a, b) => b.revenue - a.revenue)
  const segs = [...(segments?.segments ?? [])].sort((a, b) => b.size - a.size)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Panel id="cat-revenue" title="Revenue by category" className="xl:col-span-3"
               subtitle="All paid orders, ranked. Hover a bar for units sold and catalogue size.">
          <ResponsiveContainer width="100%" height={Math.max(260, cats.length * 34)}>
            <BarChart data={cats} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }} barCategoryGap={8}>
              <CartesianGrid horizontal={false} stroke={CHART.grid} />
              <XAxis type="number" tick={CHART.axis} tickLine={false} axisLine={false} tickFormatter={axisINR} />
              <YAxis type="category" dataKey="category" tick={{ ...CHART.axis, fill: CHART.label, width: 200 }} tickLine={false} axisLine={false} width={150} interval={0} />
              <Tooltip cursor={{ fill: CHART.cursor }} content={<CategoryTip />} />
              <Bar dataKey="revenue" fill={CHART.accent} maxBarSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                <LabelList dataKey="revenue" position="right" formatter={(v) => formatINRCompact(Number(v))}
                           style={{ fontSize: 11, fill: CHART.axis.fill }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel id="segments" title="Customer segments" className="xl:col-span-2"
               subtitle={segments?.silhouette_score != null
                 ? `KMeans over recency, frequency and spend. Silhouette ${segments.silhouette_score.toFixed(3)}.`
                 : 'KMeans over recency, frequency and spend.'}>
          {segs.length ? (
            <ul className="space-y-4">
              {segs.map((s) => (
                <li key={s.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-cloud">{s.name}</span>
                    <span className="tabular-nums text-silver">{s.size.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-graphite-2">
                    <div className="h-full rounded-full bg-lavender" style={{ width: `${(s.size / segs[0].size) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-silver">
                    avg {formatINRCompact(s.avg_total_spent)} · {s.avg_frequency.toFixed(1)} orders · last order ~{Math.round(s.avg_recency_days)}d before the latest
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-16 text-center text-sm text-silver">Not enough order history to segment customers yet.</p>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel id="top" title="Best sellers" subtitle="By units sold across all paid orders.">
          <ProductList rows={products?.top_products.slice(0, 8) ?? []}
                       detail={(p) => `${(p.units_sold ?? 0).toLocaleString('en-IN')} sold · ${formatINRCompact(p.revenue ?? 0)}`} />
        </Panel>
        <Panel id="low" title="Slow movers" subtitle="Listed products with the fewest sales: candidates for a bundle or a discount.">
          <ProductList rows={products?.low_conversion_products.slice(0, 8) ?? []}
                       detail={(p) => `${(p.units_sold ?? 0).toLocaleString('en-IN')} sold · ${formatINR(p.revenue ?? 0)}`} />
        </Panel>
      </div>
    </div>
  )
}

function ProductList({ rows, detail }: { rows: Product[]; detail: (p: Product) => string }) {
  return (
    <ol className="divide-y divide-line">
      {rows.map((p, i) => (
        <li key={p._id} className="flex items-center gap-3 py-2.5 text-sm">
          <span className="w-5 shrink-0 font-mono text-[11px] text-silver">{String(i + 1).padStart(2, '0')}</span>
          <span className="min-w-0 flex-1 truncate text-cloud">{p.name}</span>
          <span className="shrink-0 tabular-nums text-xs text-silver">{detail(p)}</span>
        </li>
      ))}
    </ol>
  )
}

function CategoryTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null
  const c = payload[0].payload as CategoryRow
  return (
    <TipCard title={c.category} swatch={CHART.accent} rows={[
      ['Revenue', formatINR(c.revenue)],
      ['Units sold', c.units_sold.toLocaleString('en-IN')],
      ['Products', c.product_count.toLocaleString('en-IN')],
    ]} />
  )
}
