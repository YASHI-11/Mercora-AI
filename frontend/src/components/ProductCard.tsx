import { Link } from 'react-router-dom'
import { Star, Plus, Check } from 'lucide-react'
import type { Product } from '../types'

export default function ProductCard({ product, onAdd, adding, added }: {
  product: Product
  onAdd?: (id: string) => void
  adding?: boolean
  added?: boolean
}) {
  const finalPrice = product.price * (1 - (product.discount || 0) / 100)

  return (
    <div className="group flex flex-col rounded-lg border border-zinc-200 bg-white overflow-hidden hover:shadow-sm transition-shadow">
      <Link to={`/shop/product/${product._id}`} className="block aspect-square bg-zinc-100 overflow-hidden">
        <img src={product.image} alt={product.name} loading="lazy"
             className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-200" />
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{product.category}</span>
        <Link to={`/shop/product/${product._id}`} className="text-sm font-medium text-zinc-900 leading-snug line-clamp-2 hover:underline">
          {product.name}
        </Link>
        <p className="text-xs text-zinc-500 line-clamp-2">{product.description}</p>
        {product.reason && (
          <p className="text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1 mt-0.5">{product.reason}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold text-zinc-900">₹{finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            {product.discount > 0 && (
              <span className="text-xs text-zinc-400 line-through">₹{product.price.toLocaleString('en-IN')}</span>
            )}
          </div>
          <span className="flex items-center gap-0.5 text-xs text-zinc-600">
            <Star size={12} className="fill-amber-400 text-amber-400" /> {product.rating}
          </span>
        </div>
        {onAdd && (
          <button
            onClick={() => onAdd(product._id)}
            disabled={adding}
            className={`mt-2 flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium text-white disabled:opacity-60 ${
              added ? 'bg-emerald-600 hover:bg-emerald-600' : 'bg-zinc-900 hover:bg-zinc-700'
            }`}
          >
            {added ? <><Check size={13} /> Added</> : <><Plus size={13} /> {adding ? 'Adding…' : 'Add to Cart'}</>}
          </button>
        )}
      </div>
    </div>
  )
}
