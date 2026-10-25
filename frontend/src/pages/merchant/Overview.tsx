import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { api } from '../../lib/api'
import StatCard from '../../components/StatCard'
import { LoadingState, ErrorState } from '../../components/StateViews'
import { Panel, TipCard } from '../../components/merchant/ui'
import { CHART, axisINR, type TipProps } from '../../components/merchant/theme'
import { formatINR, formatINRCompact } from '../../hooks/useCatalog'
import type { MerchantOverview } from '../../types'

type Day = { date: string; revenue: number; orders: number }
const WINDOW = 30

export default function Overview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['merchant-overview'],
    queryFn: async () => (await api.get<MerchantOverview>('/merchant/overview')).data,
  })
  const { data: series } = useQuery({
    queryKey: ['merchant-timeseries'],
    queryFn: async () => (await api.get<{ series: Day[] }>('/merchant/analytics/timeseries', { params: { days: WINDOW * 2 } })).data,
  })

  if (isLoading) return <LoadingState label="Loading dashboard…" />
  if (error || !data) return <ErrorState message={(error as Error)?.message || 'Failed to load overview'} />

  // The last 30 days of data against the 30 before them, anchored to the
  // latest day in the series.
  const days = series?.series ?? []
  const latest = days.length ? new Date(days[days.length - 1].date) : null
  const cutoff = latest ? new Date(latest.getTime() - (WINDOW - 1) * 86_400_000).toISOString().slice(0, 10) : ''
  const recent = days.filter((d) => d.date >= cutoff)
  const before = days.filter((d) => d.date < cutoff)
  const sum = (rows: Day[], key: 'revenue' | 'orders') => rows.reduce((s, d) => s + d[key], 0)
  const recentRevenue = sum(recent, 'revenue')
  const change = before.length ? (recentRevenue - sum(before, 'revenue')) / Math.max(sum(before, 'revenue'), 1) : null
  const measuredConversion = (data.checkout_sessions ?? 0) > 0

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-graphite">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_18rem_at_90%_-4rem,rgba(36,87,214,0.08),transparent_70%)]" />
        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,280px)_1fr] lg:items-end">
          <div>
            <p className="eyebrow">Revenue, last {WINDOW} days</p>
            <p className="mt-3 font-grotesk text-5xl font-semibold tracking-tight text-cloud tabular-nums">
              {series ? formatINRCompact(recentRevenue) : '—'}
            </p>
            {change !== null && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-silver">
                {change >= 0
                  ? <ArrowUpRight size={16} className="text-lavender" aria-hidden />
                  : <ArrowDownRight size={16} className="text-violet" aria-hidden />}
                <span className="tabular-nums text-cloud">{change >= 0 ? '+' : ''}{(change * 100).toFixed(1)}%</span>
                vs the {WINDOW} days before
              </p>
            )}
            <p className="mt-1 text-sm text-silver">
              {sum(recent, 'orders').toLocaleString('en-IN')} orders in the period
            </p>
          </div>
          <div className="h-56 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={days} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="rev-wash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={CHART.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="date" tick={CHART.axis} tickLine={false} axisLine={false} minTickGap={40}
                       tickFormatter={(d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
                <YAxis tick={CHART.axis} tickLine={false} axisLine={false} width={48} tickFormatter={axisINR} />
                <Tooltip cursor={{ stroke: CHART.accent, strokeOpacity: 0.3 }} content={<DayTip />} />
                <Area type="monotone" dataKey="revenue" stroke={CHART.accent} strokeWidth={2} fill="url(#rev-wash)"
                      activeDot={{ r: 4, fill: CHART.accent, stroke: CHART.surface, strokeWidth: 2 }} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Revenue, all time" value={formatINRCompact(data.total_revenue)} />
        <StatCard label="Paid orders" value={data.total_orders.toLocaleString('en-IN')} />
        <StatCard label="Average order value" value={formatINR(data.average_order_value)} />
        <StatCard label="Checkout conversion" value={measuredConversion ? `${data.conversion_rate.toFixed(1)}%` : '—'}
                  sub={measuredConversion ? `${data.checkout_sessions!.toLocaleString('en-IN')} checkout sessions` : 'No checkout sessions tracked yet'} />
        <StatCard label="AI-attributed revenue" value={formatINRCompact(data.ai_attributed_revenue)}
                  sub={`${data.ai_attributed_orders.toLocaleString('en-IN')} orders via the agents`} />
        <StatCard label="Pending opportunities" value={data.growth_opportunities_count.toLocaleString('en-IN')} />
      </div>

      <Panel title="Waiting for you" subtitle="The growth agent proposes; nothing reaches the catalogue until you approve it.">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-silver">
            <span className="font-grotesk text-2xl font-semibold text-cloud tabular-nums">{data.growth_opportunities_count}</span>
            {' '}bundle and upsell opportunities are pending review.
          </p>
          <Link to="/merchant/opportunities" className="inline-flex items-center gap-1.5 rounded-full bg-cloud px-4 py-2 text-xs font-semibold text-obsidian hover:bg-cloud-strong">
            Review opportunities <ArrowRight size={14} />
          </Link>
        </div>
      </Panel>
    </div>
  )
}

function DayTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as Day
  return (
    <TipCard title={new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
             rows={[['Revenue', formatINR(d.revenue)], ['Orders', d.orders.toLocaleString('en-IN')]]} />
  )
}
