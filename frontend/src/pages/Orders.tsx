import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { api, getCustomerId } from '../lib/api'
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews'
import type { Order } from '../types'

const statusColor: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
}

export default function Orders() {
  const customerId = getCustomerId()
  const { data, isLoading, error } = useQuery({
    queryKey: ['orders', customerId],
    queryFn: async () => (await api.get<{ orders: Order[] }>('/orders', { params: { customer_id: customerId } })).data,
  })

  if (isLoading) return <LoadingState label="Loading orders…" />
  if (error) return <ErrorState message={(error as Error).message} />

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-zinc-900 mb-6">Your Orders</h1>
      {(!data || data.orders.length === 0) ? (
        <EmptyState title="No orders yet" subtitle="Orders you place will show up here." />
      ) : (
        <div className="space-y-3">
          {data.orders.map((o) => (
            <div key={o._id} className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-zinc-400">{o._id}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[o.payment_status] || 'bg-zinc-100 text-zinc-600'}`}>
                  {o.payment_status}
                </span>
              </div>
              <div className="space-y-1 mb-2">
                {o.items.map((i) => (
                  <p key={i.product_id} className="text-sm text-zinc-600">{i.name} × {i.quantity}</p>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm border-t border-zinc-100 pt-2">
                <span className="text-zinc-400">{new Date(o.created_at).toLocaleString()}</span>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-zinc-900">₹{o.total.toLocaleString('en-IN')}</span>
                  {o.payment_status === 'paid' && (
                    <Link to={`/orders/${o._id}/invoice`} className="flex items-center gap-1 text-xs font-medium text-gold-600 hover:text-gold-700">
                      <FileText size={12} /> Invoice
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
