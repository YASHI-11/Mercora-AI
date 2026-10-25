import { useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { api, getCustomerId } from '../lib/api'
import { useCart } from './useCart'
import { toast } from '../lib/toast'
import type { Product } from '../types'

export interface CategoryInfo {
  category: string
  count: number
  image: string
  top_product: string
  subcategories: string[]
}

/** The taxonomy as it exists in the database -- never hardcoded. */
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () =>
      (await api.get<{ categories: string[]; taxonomy: CategoryInfo[] }>('/products/categories')).data,
    staleTime: 5 * 60_000,
  })
}

export interface ProductQuery {
  category?: string
  subcategory?: string
  sort?: string
  q?: string
  min_price?: number
  max_price?: number
  min_rating?: number
  in_stock?: boolean
  limit?: number
  skip?: number
}

export function useProducts(params: ProductQuery, enabled = true) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: async () => (await api.get<{ products: Product[]; total: number }>('/products', { params })).data,
    enabled,
    placeholderData: (prev) => prev,
  })
}

/** Products fetched individually by id (wishlist, compare). */
export function useProductsById(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ['product', id],
      queryFn: async () => (await api.get<Product>(`/products/${id}`)).data,
      retry: false,
    })),
  })
}

export function useAddToCart() {
  const { invalidate } = useCart()
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function add(product: Pick<Product, '_id' | 'name'>, quantity = 1) {
    setPendingId(product._id)
    try {
      await api.post('/cart/items', { product_id: product._id, quantity },
                     { params: { customer_id: getCustomerId() } })
      invalidate()
      toast(`${product.name} added to cart`)
      return true
    } catch (e) {
      toast((e as Error).message || 'Could not add to cart', 'error')
      return false
    } finally {
      setPendingId(null)
    }
  }

  return { add, pendingId }
}

export function availability(p: Pick<Product, 'inventory'>) {
  if (p.inventory == null) return null
  if (p.inventory <= 0) return { label: 'Out of stock', tone: 'text-red-400' }
  if (p.inventory <= 15) return { label: `Only ${p.inventory} left`, tone: 'text-amber-300' }
  return { label: 'In stock', tone: 'text-emerald-400' }
}

export const formatINR = (value: number) =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

/** Indian short scale for dashboards: ₹87.2 Cr, ₹4.6 L, ₹12.3K. */
export function formatINRCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e7) return `₹${(value / 1e7).toFixed(1)} Cr`
  if (abs >= 1e5) return `₹${(value / 1e5).toFixed(1)} L`
  if (abs >= 1e3) return `₹${(value / 1e3).toFixed(1)}K`
  return `₹${Math.round(value)}`
}

export const finalPrice = (p: Pick<Product, 'price' | 'discount'>) => p.price * (1 - (p.discount || 0) / 100)
