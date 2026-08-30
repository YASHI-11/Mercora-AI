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
    <div className="group flex flex-col rounded-2xl border border-zinc-200 bg-white overflow-hidden transition-all hover:border-zinc-300 hover:shadow-lg hover:shadow-zinc-900/[0.04] hover:-translate-y-0.5">
      <Link to={`/shop/product/${product._id}`} className="block aspect-square bg-zinc-100 overflow-hidden relative">
        <img src={product.image} alt={product.name} loading="lazy"
             className="h-full w-full object-cover group-hover:scale-[1.04] transition-transform duration-300" />
        {product.discount > 0 && (
          <span className="absolute top-2.5 left-2.5 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-gold-300">
            {product.discount}% OFF
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gold-600">{product.category}</span>
        <Link to={`/shop/product/${product._id}`} className="text-sm font-medium text-zinc-900 leading-snug line-clamp-2 hover:text-gold-700">
          {product.name}
        </Link>
        <p className="text-xs text-zinc-500 line-clamp-2">{product.description}</p>
        {product.reason && (
          <p className="text-xs text-emerald-700 bg-emerald-50 rounded-md px-2 py-1 mt-0.5">{product.reason}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-2.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-semibold text-zinc-900">₹{finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            {product.discount > 0 && (
              <span className="text-xs text-zinc-400 line-through">₹{product.price.toLocaleString('en-IN')}</span>
            )}
          </div>
          <span className="flex items-center gap-0.5 text-xs font-medium text-zinc-600">
            <Star size={12} className="fill-gold-400 text-gold-400" /> {product.rating}
          </span>
        </div>
        {onAdd && (
          <button
            onClick={() => onAdd(product._id)}
            disabled={adding}
            className={`mt-2.5 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-semibold disabled:opacity-60 ${
              added
                ? 'bg-emerald-600 text-white hover:bg-emerald-600'
                : 'bg-ink text-white hover:bg-zinc-800'
            }`}
          >
            {added ? <><Check size={13} /> Added</> : <><Plus size={13} /> {adding ? 'Adding…' : 'Add to Cart'}</>}
          </button>
        )}
      </div>
    </div>
  )
}
