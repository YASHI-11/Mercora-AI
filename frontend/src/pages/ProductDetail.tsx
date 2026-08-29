import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Star, Plus, ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { api, getCustomerId } from '../lib/api'
import { useCart } from '../hooks/useCart'
import ProductCard from '../components/ProductCard'
import { LoadingState, ErrorState } from '../components/StateViews'
import type { Product } from '../types'

export default function ProductDetail() {
  const { id } = useParams()
  const { invalidate } = useCart()
  const customerId = getCustomerId()
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => (await api.get<Product>(`/products/${id}`)).data,
  })

  const { data: recs } = useQuery({
    queryKey: ['recommendations', id],
    queryFn: async () => (await api.get<{ similar: Product[]; cross_sell: Product[] }>(`/recommendations/${id}`)).data,
    enabled: !!id,
  })

  async function addToCart() {
    if (!id) return
    setAdding(true)
    try {
      await api.post('/cart/items', { product_id: id, quantity: 1 }, { params: { customer_id: customerId } })
      invalidate()
      setAdded(true)
      setTimeout(() => setAdded(false), 1800)
    } finally {
      setAdding(false)
    }
  }

  if (isLoading) return <LoadingState label="Loading product…" />
  if (error || !product) return <ErrorState message="Product not found." />

  const finalPrice = product.price * (1 - (product.discount || 0) / 100)

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 mb-6">
        <ArrowLeft size={14} /> Back to shop
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="aspect-square rounded-lg overflow-hidden bg-zinc-100">
          <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
        </div>

        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{product.category} · {product.brand}</span>
          <h1 className="text-2xl font-semibold text-zinc-900 mt-1">{product.name}</h1>
          <div className="flex items-center gap-1.5 mt-2 text-sm text-zinc-600">
            <Star size={14} className="fill-amber-400 text-amber-400" /> {product.rating} rating
          </div>

          <div className="flex items-baseline gap-2 mt-4">
            <span className="text-2xl font-semibold text-zinc-900">₹{finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            {product.discount > 0 && (
              <>
                <span className="text-sm text-zinc-400 line-through">₹{product.price.toLocaleString('en-IN')}</span>
                <span className="text-sm font-medium text-emerald-600">{product.discount}% off</span>
              </>
            )}
          </div>

          <p className="text-sm text-zinc-600 mt-4 leading-relaxed">{product.description}</p>

          {product.features?.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {product.features.map((f) => (
                <li key={f} className="text-sm text-zinc-700 flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-zinc-400" /> {f}
                </li>
              ))}
            </ul>
          )}

          <button onClick={addToCart} disabled={adding}
                  className="mt-6 flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
            <Plus size={15} /> {added ? 'Added to cart ✓' : adding ? 'Adding…' : 'Add to Cart'}
          </button>

          <div className="mt-4 rounded-md bg-zinc-50 border border-zinc-200 px-4 py-3">
            <p className="text-xs font-semibold text-zinc-700 mb-1">Why ShopPilot recommends this</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Rated {product.rating}★ in {product.category}, priced at ₹{finalPrice.toFixed(0)} — selected based on
              content similarity and popularity signals from our recommendation model.
            </p>
          </div>
        </div>
      </div>

      {recs && recs.cross_sell.length > 0 && (
        <section className="mt-14">
          <h2 className="text-base font-semibold text-zinc-900 mb-1">Frequently bought together</h2>
          <p className="text-xs text-zinc-400 mb-4">Based on real purchase patterns from other customers.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {recs.cross_sell.map((p) => <ProductCard key={p._id} product={p} />)}
          </div>
        </section>
      )}

      {recs && recs.similar.length > 0 && (
        <section className="mt-10">
          <h2 className="text-base font-semibold text-zinc-900 mb-4">You may also like</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {recs.similar.map((p) => <ProductCard key={p._id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  )
}
