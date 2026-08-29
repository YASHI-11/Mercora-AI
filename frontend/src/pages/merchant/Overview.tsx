import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../../lib/api'
import StatCard from '../../components/StatCard'
import { LoadingState, ErrorState } from '../../components/StateViews'
import type { MerchantOverview } from '../../types'

export default function Overview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['merchant-overview'],
    queryFn: async () => (await api.get<MerchantOverview>('/merchant/overview')).data,
  })

  const { data: series } = useQuery({
    queryKey: ['merchant-timeseries'],
    queryFn: async () => (await api.get<{ series: { date: string; revenue: number; orders: number }[] }>('/merchant/analytics/timeseries', { params: { days: 60 } })).data,
  })

  if (isLoading) return <LoadingState label="Loading dashboard…" />
  if (error || !data) return <ErrorState message={(error as Error)?.message || 'Failed to load overview'} />

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatCard label="Revenue" value={`₹${(data.total_revenue / 100000).toFixed(1)}L`} />
        <StatCard label="Orders" value={data.total_orders.toLocaleString('en-IN')} />
        <StatCard label="Conversion" value={`${data.conversion_rate.toFixed(1)}%`} />
        <StatCard label="Avg Order Value" value={`₹${data.average_order_value.toLocaleString('en-IN')}`} />
        <StatCard label="AI-attributed Revenue" value={`₹${(data.ai_attributed_revenue / 100000).toFixed(1)}L`} sub={`${data.ai_attributed_orders} orders`} />
        <StatCard label="Growth Opportunities" value={String(data.growth_opportunities_count)} />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900 mb-4">Revenue — last 60 days</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={series?.series || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#a1a1aa' }} tickFormatter={(d) => d.slice(5)} minTickGap={30} />
            <YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} width={50} />
            <Tooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
            <Line type="monotone" dataKey="revenue" stroke="#18181b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
