import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { LoadingState } from '../../components/StateViews'
import type { Product } from '../../types'

export default function MerchantProducts() {
  const { data, isLoading } = useQuery({
    queryKey: ['merchant-products'],
    queryFn: async () => (await api.get<{ products: Product[]; total: number }>('/products', { params: { limit: 100 } })).data,
  })

  if (isLoading) return <LoadingState label="Loading products…" />

  return (
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
              <th className="px-4 py-2.5 font-medium">Product</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Price</th>
              <th className="px-4 py-2.5 font-medium">Discount</th>
              <th className="px-4 py-2.5 font-medium">Inventory</th>
              <th className="px-4 py-2.5 font-medium">Rating</th>
            </tr>
          </thead>
          <tbody>
            {data?.products.map((p) => (
              <tr key={p._id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                <td className="px-4 py-2.5 flex items-center gap-2">
                  <img src={p.image} className="h-8 w-8 rounded object-cover" />
                  <span className="text-zinc-800 truncate max-w-xs">{p.name}</span>
                </td>
                <td className="px-4 py-2.5 text-zinc-500">{p.category}</td>
                <td className="px-4 py-2.5 text-zinc-800">₹{p.price.toLocaleString('en-IN')}</td>
                <td className="px-4 py-2.5 text-zinc-500">{p.discount}%</td>
                <td className="px-4 py-2.5 text-zinc-500">{p.inventory}</td>
                <td className="px-4 py-2.5 text-zinc-500">{p.rating}★</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 text-xs text-zinc-400 border-t border-zinc-100">
        Showing {data?.products.length} of {data?.total} products
      </div>
    </div>
  )
}
