import { Link, useNavigate } from 'react-router-dom'
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from 'lucide-react'
import { api, getCustomerId } from '../lib/api'
import { useCart } from '../hooks/useCart'
import { formatINR } from '../hooks/useCatalog'
import { LoadingState } from '../components/StateViews'
import ProductImage from '../components/ProductImage'
import { toast } from '../lib/toast'

export default function Cart() {
  const { cart, isLoading, invalidate } = useCart()
  const customerId = getCustomerId()
  const navigate = useNavigate()

  async function setQty(productId: string, name: string, qty: number) {
    try {
      if (qty <= 0) {
        await api.delete(`/cart/items/${productId}`, { params: { customer_id: customerId } })
        toast(`${name} removed from cart`)
      } else {
        await api.put(`/cart/items/${productId}`, { quantity: qty }, { params: { customer_id: customerId } })
      }
      invalidate()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  if (isLoading) return <LoadingState label="Loading cart…" />
  const count = cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0
  const savings = cart ? Math.max(0, cart.subtotal - cart.total) : 0

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="text-4xl font-semibold text-cloud">Your cart</h1>
      {cart && cart.items.length > 0 && <p className="mt-2 text-sm text-silver">{count} item{count === 1 ? '' : 's'}</p>}

      {!cart || cart.items.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <ShoppingBag size={30} className="text-silver" aria-hidden />
          <p className="text-cloud">Your cart is empty.</p>
          <p className="text-sm text-silver">Browse the catalogue, or describe what you need to the AI assistant.</p>
          <div className="mt-3 flex gap-3">
            <Link to="/shop" className="rounded-full bg-cloud px-6 py-3 text-sm font-semibold text-obsidian hover:bg-white">Browse products</Link>
            <Link to="/assistant" className="rounded-full border border-line px-6 py-3 text-sm font-semibold text-cloud hover:bg-white/5">Ask the assistant</Link>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          <ul className="divide-y divide-line rounded-3xl border border-line bg-graphite">
            {cart.items.map((item) => (
              <li key={item.product_id} className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap">
                <Link to={`/shop/product/${item.product_id}`} className="shrink-0">
                  <ProductImage src={item.image} name={item.name} category={item.category}
                                subcategory={item.subcategory} compact className="h-20 w-20 rounded-xl" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/shop/product/${item.product_id}`} className="line-clamp-2 text-sm font-medium text-cloud hover:text-lavender">{item.name}</Link>
                  {item.subcategory && <p className="mt-0.5 text-xs text-silver">{item.subcategory}</p>}
                  <p className="mt-1 text-xs text-silver">{formatINR(item.price)} each</p>
                </div>
                <div className="flex items-center rounded-full border border-line" role="group" aria-label={`Quantity of ${item.name}`}>
                  <button onClick={() => setQty(item.product_id, item.name, item.quantity - 1)} aria-label="Decrease quantity"
                          className="flex h-9 w-9 items-center justify-center text-silver hover:text-cloud"><Minus size={13} /></button>
                  <span className="w-7 text-center text-sm text-cloud">{item.quantity}</span>
                  <button onClick={() => setQty(item.product_id, item.name, item.quantity + 1)} aria-label="Increase quantity"
                          className="flex h-9 w-9 items-center justify-center text-silver hover:text-cloud"><Plus size={13} /></button>
                </div>
                <span className="w-24 text-right text-sm font-semibold text-cloud">{formatINR(item.line_total)}</span>
                <button onClick={() => setQty(item.product_id, item.name, 0)} aria-label={`Remove ${item.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-silver hover:bg-white/5 hover:text-red-400">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>

          <aside aria-label="Order summary" className="h-fit rounded-3xl border border-line bg-graphite p-6 lg:sticky lg:top-24">
            <h2 className="text-lg font-semibold text-cloud">Order summary</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between text-silver"><dt>Subtotal</dt><dd className="text-cloud">{formatINR(cart.subtotal)}</dd></div>
              {savings > 0 && <div className="flex justify-between text-silver"><dt>Discount</dt><dd className="text-emerald-400">−{formatINR(savings)}</dd></div>}
              <div className="flex justify-between text-silver"><dt>Delivery</dt><dd className="text-cloud">No charge</dd></div>
              <div className="flex justify-between border-t border-line pt-3 text-base font-semibold text-cloud"><dt>Total</dt><dd>{formatINR(cart.total)}</dd></div>
            </dl>
            <button onClick={() => navigate('/checkout')}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-cloud py-3.5 text-sm font-semibold text-obsidian hover:bg-white">
              Proceed to checkout <ArrowRight size={15} />
            </button>
            <Link to="/shop" className="mt-4 block text-center text-xs text-silver hover:text-cloud">Continue shopping</Link>
          </aside>
        </div>
      )}
    </div>
  )
}
