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
        <div className="aspect-square rounded-2xl overflow-hidden bg-zinc-100 border border-zinc-200">
          <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gold-600">{product.category} · {product.brand}</span>
          <h1 className="font-display italic text-3xl text-zinc-900 mt-1.5 leading-tight">{product.name}</h1>
          <div className="flex items-center gap-1.5 mt-2.5 text-sm text-zinc-600">
            <Star size={14} className="fill-gold-400 text-gold-400" /> {product.rating} rating
          </div>

          <div className="flex items-baseline gap-2 mt-5">
            <span className="text-3xl font-semibold text-zinc-900">₹{finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
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
                  <span className="h-1 w-1 rounded-full bg-gold-400" /> {f}
                </li>
              ))}
            </ul>
          )}

          <button onClick={addToCart} disabled={adding}
                  className={`mt-6 flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white disabled:opacity-60 ${
                    added ? 'bg-emerald-600 hover:bg-emerald-600' : 'bg-ink hover:bg-zinc-800'
                  }`}>
            <Plus size={15} /> {added ? 'Added to cart ✓' : adding ? 'Adding…' : 'Add to Cart'}
          </button>

          <div className="mt-5 rounded-xl bg-gold-50 border border-gold-100 px-4 py-3.5">
            <p className="text-xs font-semibold text-gold-700 mb-1">✦ Why Mercora recommends this</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Rated {product.rating}★ in {product.category}, priced at ₹{finalPrice.toFixed(0)} — selected based on
              content similarity and popularity signals from our recommendation model.
            </p>
          </div>
        </div>
      </div>

      {recs && recs.cross_sell.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display italic text-xl text-zinc-900 mb-1">Frequently bought together</h2>
          <p className="text-xs text-zinc-400 mb-4">Based on real purchase patterns from other customers.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {recs.cross_sell.map((p) => <ProductCard key={p._id} product={p} />)}
          </div>
        </section>
      )}

      {recs && recs.similar.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display italic text-xl text-zinc-900 mb-4">You may also like</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {recs.similar.map((p) => <ProductCard key={p._id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  )
}
