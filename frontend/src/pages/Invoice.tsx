import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { Printer, ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import { LoadingState, ErrorState } from '../components/StateViews'
import type { Invoice } from '../types'

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, error } = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => (await api.get<Invoice>(`/orders/${id}/invoice`)).data,
    enabled: !!id,
  })

  if (isLoading) return <LoadingState label="Loading invoice…" />
  if (error) return <ErrorState message={(error as Error).message} />
  if (!data) return null

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link to="/orders" className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
          <ArrowLeft size={14} /> Back to Orders
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          <Printer size={14} /> Print / Save as PDF
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none print:rounded-none">
        <div className="flex items-start justify-between border-b border-zinc-200 pb-6 mb-6">
          <div>
            <div className="flex items-center gap-2 text-zinc-900 mb-1">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-gold-300 text-[12px] font-display italic">M</span>
              <span className="font-display italic text-lg">Mercora AI</span>
            </div>
            <p className="text-xs text-zinc-400">Tax Invoice</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-zinc-900">{data.invoice_number}</p>
            <p className="text-xs text-zinc-500">{new Date(data.issued_at).toLocaleString()}</p>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">{data.order_id}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">Billed To</p>
            <p className="text-sm font-medium text-zinc-900">{data.customer.name}</p>
            <p className="text-sm text-zinc-500">{data.customer.address}</p>
            <p className="text-sm text-zinc-500">{data.customer.phone}</p>
            <p className="text-sm text-zinc-500">{data.customer.email}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">Delivery Details</p>
            <p className="text-sm font-medium text-zinc-900">{data.delivery.name}</p>
            <p className="text-sm text-zinc-500">{data.delivery.address}</p>
            <p className="text-sm text-zinc-500">{data.delivery.phone}</p>
          </div>
        </div>

        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              <th className="py-2">Item</th>
              <th className="py-2 text-center">Qty</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={i.product_id} className="border-b border-zinc-100">
                <td className="py-2.5 text-zinc-800">{i.name}</td>
                <td className="py-2.5 text-center text-zinc-600">{i.quantity}</td>
                <td className="py-2.5 text-right text-zinc-600">₹{i.price.toLocaleString('en-IN')}</td>
                <td className="py-2.5 text-right text-zinc-800">₹{(i.price * i.quantity).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-6">
          <div className="w-56 space-y-1.5">
            <div className="flex justify-between text-sm text-zinc-500">
              <span>Subtotal</span><span>₹{data.subtotal.toLocaleString('en-IN')}</span>
            </div>
            {data.discount > 0 && (
              <div className="flex justify-between text-sm text-zinc-500">
                <span>Discount</span><span>−₹{data.discount.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold text-zinc-900 border-t border-zinc-200 pt-1.5">
              <span>Amount Paid</span><span>₹{data.total.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-200 pt-4 flex items-center justify-between">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 capitalize">
            Payment {data.payment.status}
          </span>
          {data.payment.razorpay_payment_id && (
            <span className="text-xs text-zinc-400 font-mono">{data.payment.razorpay_payment_id}</span>
          )}
        </div>
      </div>
    </div>
  )
}
