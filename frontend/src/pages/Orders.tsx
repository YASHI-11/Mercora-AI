import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { api, getCustomerId } from '../lib/api'
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews'
import type { Order } from '../types'

const statusColor: Record<string, string> = {
  paid: 'bg-good/10 text-good',
  pending: 'bg-warn/10 text-warn',
  failed: 'bg-bad/10 text-bad',
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
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="mb-8 text-4xl font-semibold text-cloud">Your Orders</h1>
      {(!data || data.orders.length === 0) ? (
        <EmptyState title="No orders yet" subtitle="Orders you place will show up here." />
      ) : (
        <div className="space-y-3">
          {data.orders.map((o) => (
            <div key={o._id} className="rounded-2xl border border-line bg-graphite p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-silver">{o._id}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[o.payment_status] || 'bg-tint/10 text-silver'}`}>
                  {o.payment_status}
                </span>
              </div>
              <div className="space-y-1 mb-2">
                {o.items.map((i) => (
                  <p key={i.product_id} className="text-sm text-silver">{i.name} × {i.quantity}</p>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm border-t border-line pt-2">
                <span className="text-silver">{new Date(o.created_at).toLocaleString()}</span>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-cloud">₹{o.total.toLocaleString('en-IN')}</span>
                  {o.payment_status === 'paid' && (
                    <Link to={`/orders/${o._id}/invoice`} className="flex items-center gap-1 text-xs font-medium text-lavender hover:text-cloud">
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
