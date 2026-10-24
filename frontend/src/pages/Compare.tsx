import { Link } from 'react-router-dom'
import { X, Star } from 'lucide-react'
import { useCompare } from '../hooks/useStoredIds'
import { useAddToCart, useProductsById, formatINR, finalPrice, availability } from '../hooks/useCatalog'
import ProductImage from '../components/ProductImage'
import type { Product } from '../types'

// Only attributes the catalogue actually records (spec §8.2: "Do not
// fabricate specifications to make the comparison appear complete").
const ROWS: { label: string; value: (p: Product) => string }[] = [
  { label: 'Price', value: (p) => formatINR(finalPrice(p)) },
  { label: 'Rating', value: (p) => (p.rating_imputed ? `${p.rating} (estimated)` : `${p.rating} from ${p.rating_count?.toLocaleString('en-IN') ?? '—'} buyers`) },
  { label: 'Category', value: (p) => p.category },
  { label: 'Range', value: (p) => p.subcategory ?? '—' },
  { label: 'Details', value: (p) => (p.features?.length ? p.features.join(', ') : '—') },
  { label: 'Units sold', value: (p) => (p.units_sold ? p.units_sold.toLocaleString('en-IN') : '—') },
  { label: 'Availability', value: (p) => availability(p)?.label ?? '—' },
]

export default function Compare() {
  const compare = useCompare()
  const products = useProductsById(compare.ids).map((r) => r.data).filter((p): p is Product => !!p)
  const { add, pendingId } = useAddToCart()

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
      <p className="eyebrow">Side by side</p>
      <h1 className="display-section mt-4 font-semibold text-cloud">Compare.</h1>

      {compare.ids.length < 2 ? (
        <div className="mt-12 text-silver">
          <p>Select two or three products to compare using the <span className="text-cloud">compare</span> button on any product card.</p>
          <Link to="/shop" className="mt-6 inline-block rounded-full bg-cloud px-6 py-3 text-sm font-semibold text-obsidian hover:bg-white">Browse products</Link>
        </div>
      ) : (
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Product comparison</caption>
            <thead>
              <tr>
                <th scope="col" className="w-36" />
                {products.map((p) => (
                  <th key={p._id} scope="col" className="px-3 pb-6 align-top text-left font-normal">
                    <div className="relative overflow-hidden rounded-2xl border border-line bg-graphite-2">
                      <ProductImage src={p.image} name={p.name} category={p.category} subcategory={p.subcategory} className="aspect-square w-full" />
                      <button onClick={() => compare.remove(p._id)} aria-label={`Remove ${p.name} from comparison`}
                              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-obsidian/75 text-cloud hover:bg-obsidian">
                        <X size={14} />
                      </button>
                    </div>
                    <Link to={`/shop/product/${p._id}`} className="mt-3 block font-medium text-cloud hover:text-lavender">{p.name}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="border-t border-line py-3.5 pr-3 text-left font-normal text-silver">{row.label}</th>
                  {products.map((p) => (
                    <td key={p._id} className="border-t border-line px-3 py-3.5 text-cloud">
                      {row.label === 'Rating' && <Star size={12} className="mr-1 inline fill-lavender text-lavender" aria-hidden />}
                      {row.value(p)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td />
                {products.map((p) => (
                  <td key={p._id} className="px-3 pt-5">
                    <button onClick={() => add(p)} disabled={pendingId === p._id || p.inventory === 0}
                            className="w-full rounded-full bg-cloud py-2.5 text-xs font-semibold text-obsidian hover:bg-white disabled:opacity-50">
                      Add to cart
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
