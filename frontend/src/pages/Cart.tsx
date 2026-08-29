import { Link, useNavigate } from 'react-router-dom'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { api, getCustomerId } from '../lib/api'
import { useCart } from '../hooks/useCart'
import { LoadingState, EmptyState } from '../components/StateViews'

export default function Cart() {
  const { cart, isLoading, invalidate } = useCart()
  const customerId = getCustomerId()
  const navigate = useNavigate()

  async function setQty(productId: string, qty: number) {
    if (qty <= 0) {
      await api.delete(`/cart/items/${productId}`, { params: { customer_id: customerId } })
    } else {
      await api.put(`/cart/items/${productId}`, { quantity: qty }, { params: { customer_id: customerId } })
    }
    invalidate()
  }

  if (isLoading) return <LoadingState label="Loading cart…" />

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-zinc-900 mb-6">Your Cart</h1>

      {(!cart || cart.items.length === 0) ? (
        <EmptyState title="Your cart is empty" subtitle="Browse the shop or ask the AI assistant for recommendations." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-8">
          <div className="space-y-3">
            {cart.items.map((item) => (
              <div key={item.product_id} className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white p-3">
                <img src={item.image} className="h-16 w-16 rounded object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{item.name}</p>
                  <p className="text-xs text-zinc-500">₹{item.price.toLocaleString('en-IN')} each</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQty(item.product_id, item.quantity - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 hover:bg-zinc-50">
                    <Minus size={12} />
                  </button>
                  <span className="w-5 text-center text-sm">{item.quantity}</span>
                  <button onClick={() => setQty(item.product_id, item.quantity + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 hover:bg-zinc-50">
                    <Plus size={12} />
                  </button>
                </div>
                <span className="w-20 text-right text-sm font-medium text-zinc-900">₹{item.line_total.toLocaleString('en-IN')}</span>
                <button onClick={() => setQty(item.product_id, 0)} className="text-zinc-400 hover:text-red-500">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 h-fit">
            <h2 className="text-sm font-semibold text-zinc-900 mb-4">Order Summary</h2>
            <div className="flex justify-between text-sm text-zinc-600 mb-2">
              <span>Subtotal</span><span>₹{cart.subtotal.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-zinc-900 border-t border-zinc-200 mt-3 pt-3">
              <span>Total</span><span>₹{cart.total.toLocaleString('en-IN')}</span>
            </div>
            <button onClick={() => navigate('/checkout')}
                    className="mt-5 w-full rounded-md bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-700">
              Proceed to Checkout
            </button>
            <Link to="/shop" className="block text-center mt-3 text-xs text-zinc-500 hover:text-zinc-900">Continue shopping</Link>
          </div>
        </div>
      )}
    </div>
  )
}
