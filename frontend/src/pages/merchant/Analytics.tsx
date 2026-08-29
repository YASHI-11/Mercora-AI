import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts'
import { api } from '../../lib/api'
import { LoadingState } from '../../components/StateViews'
import type { Product } from '../../types'

const COLORS = ['#18181b', '#52525b', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#71717a', '#3f3f46']

export default function Analytics() {
  const { data: categories, isLoading: loadingCat } = useQuery({
    queryKey: ['category-performance'],
    queryFn: async () => (await api.get<{ categories: any[] }>('/merchant/analytics/categories')).data,
  })
  const { data: products, isLoading: loadingProd } = useQuery({
    queryKey: ['product-analytics'],
    queryFn: async () => (await api.get<{ top_products: Product[]; low_conversion_products: Product[] }>('/merchant/analytics/products')).data,
  })
  const { data: segments } = useQuery({
    queryKey: ['segments'],
    queryFn: async () => (await api.get('/merchant/analytics/segments')).data,
  })

  if (loadingCat || loadingProd) return <LoadingState label="Loading analytics…" />

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900 mb-4">Revenue by Category</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={categories?.categories || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="category" tick={{ fontSize: 10, fill: '#a1a1aa' }} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} width={50} />
              <Tooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
              <Bar dataKey="revenue" fill="#18181b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900 mb-4">Customer Segments</h2>
          {segments?.segments?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={segments.segments} dataKey="size" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => e.name}>
                  {segments.segments.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-zinc-400 py-16 text-center">Not enough order history to segment customers yet.</p>
          )}
          {segments?.silhouette_score != null && (
            <p className="text-xs text-zinc-400 mt-2">Silhouette score: {segments.silhouette_score.toFixed(3)}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900 mb-3">Top Products</h2>
          <div className="space-y-2">
            {products?.top_products.slice(0, 8).map((p) => (
              <div key={p._id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700 truncate max-w-[60%]">{p.name}</span>
                <span className="text-zinc-400">{p.units_sold} sold · ₹{p.revenue?.toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900 mb-3">Low-Conversion Products</h2>
          <div className="space-y-2">
            {products?.low_conversion_products.slice(0, 8).map((p) => (
              <div key={p._id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-700 truncate max-w-[60%]">{p.name}</span>
                <span className="text-zinc-400">{p.units_sold} sold</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
