import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, getCustomerId } from '../lib/api'
import { useCart } from '../hooks/useCart'
import ProductCard from '../components/ProductCard'
import ShoppingAssistant from '../components/ShoppingAssistant'
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews'
import type { Product } from '../types'

export default function Shop() {
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const { invalidate } = useCart()
  const customerId = getCustomerId()

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<{ categories: string[] }>('/products/categories')).data,
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['products', category, sort, maxPrice],
    queryFn: async () => (await api.get<{ products: Product[]; total: number }>('/products', {
      params: { category: category || undefined, sort: sort || undefined, max_price: maxPrice || undefined, limit: 60 },
    })).data,
  })

  async function addToCart(id: string) {
    setAddingId(id)
    try {
      await api.post('/cart/items', { product_id: id, quantity: 1 }, { params: { customer_id: customerId } })
      invalidate()
      setAddedIds((prev) => new Set(prev).add(id))
      setTimeout(() => {
        setAddedIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, 2000)
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <select value={category} onChange={(e) => setCategory(e.target.value)}
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm">
              <option value="">All categories</option>
              {categoriesData?.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)}
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm">
              <option value="">Sort: Relevance</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rating">Rating</option>
              <option value="newest">Newest</option>
            </select>
            <input type="number" placeholder="Max price ₹" value={maxPrice}
                   onChange={(e) => setMaxPrice(e.target.value)}
                   className="w-32 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm" />
            {data && <span className="ml-auto text-xs text-zinc-400">{data.total} products</span>}
          </div>

          {isLoading && <LoadingState label="Loading products…" />}
          {error && <ErrorState message={(error as Error).message} />}
          {data && data.products.length === 0 && <EmptyState title="No products found" subtitle="Try a different category or price range." />}
          {data && data.products.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {data.products.map((p) => (
                <ProductCard key={p._id} product={p} onAdd={addToCart} adding={addingId === p._id} added={addedIds.has(p._id)} />
              ))}
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-20 h-[70vh] lg:h-[calc(100vh-6rem)]">
          <ShoppingAssistant />
        </div>
      </div>
    </div>
  )
}
