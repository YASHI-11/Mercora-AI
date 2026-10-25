import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { api } from '../../lib/api'
import { LoadingState } from '../../components/StateViews'
import ProductImage from '../../components/ProductImage'
import { formatINR } from '../../hooks/useCatalog'
import type { Product } from '../../types'

const LOW_STOCK = 10

export default function MerchantProducts() {
  const { data, isLoading } = useQuery({
    queryKey: ['merchant-products'],
    queryFn: async () => (await api.get<{ products: Product[]; total: number }>('/products', { params: { limit: 100 } })).data,
  })

  if (isLoading) return <LoadingState label="Loading products…" />

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-graphite">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-silver">
              <th className="px-5 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 text-right font-medium">Discount</th>
              <th className="px-4 py-3 text-right font-medium">Stock</th>
              <th className="px-5 py-3 text-right font-medium">Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {data?.products.map((p) => (
              <tr key={p._id} className="hover:bg-white/[0.03]">
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-3">
                    <ProductImage src={p.image} name={p.name} category={p.category}
                                  subcategory={p.subcategory} compact className="h-10 w-10 shrink-0 rounded-lg" />
                    <span className="max-w-xs truncate text-cloud">{p.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-cloud/90">{p.category}</span>
                  {p.subcategory && <span className="block text-[11px] text-silver">{p.subcategory}</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-cloud">{formatINR(p.price)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-silver">{p.discount ? `${p.discount}%` : '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {p.inventory < LOW_STOCK
                    ? <span className="rounded-full bg-violet/15 px-2 py-0.5 text-xs text-violet">{p.inventory} left</span>
                    : <span className="text-silver">{p.inventory.toLocaleString('en-IN')}</span>}
                </td>
                <td className="px-5 py-2.5 text-right">
                  <span className="inline-flex items-center gap-1 tabular-nums text-silver">
                    <Star size={12} className="fill-lavender text-lavender" aria-hidden />{p.rating}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-xs text-silver">
        Showing {data?.products.length.toLocaleString('en-IN')} of {data?.total.toLocaleString('en-IN')} products, most popular first
      </p>
    </div>
  )
}
