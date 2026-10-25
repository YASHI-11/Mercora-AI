import { Link } from 'react-router-dom'
import { Star, Plus, Heart, Loader2, GitCompareArrows } from 'lucide-react'
import type { Product } from '../types'
import ProductImage from './ProductImage'
import WhyThis from './WhyThis'
import { useWishlist, useCompare } from '../hooks/useStoredIds'
import { formatINR, finalPrice, availability } from '../hooks/useCatalog'

export default function ProductCard({ product, onAdd, adding, compare = false }: {
  product: Product
  onAdd?: (p: Product) => void
  adding?: boolean
  /** Show the "compare" toggle (listing pages). */
  compare?: boolean
}) {
  const wishlist = useWishlist()
  const compareList = useCompare()
  const price = finalPrice(product)
  const stock = availability(product)
  const saved = wishlist.has(product._id)
  const comparing = compareList.has(product._id)
  const href = `/shop/product/${product._id}`

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-graphite transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-lavender/40">
      <div className="relative aspect-square overflow-hidden bg-graphite-2">
        <Link to={href} tabIndex={-1} aria-hidden>
          <ProductImage src={product.image} name={product.name} category={product.category}
                        subcategory={product.subcategory}
                        className="h-full w-full transition-transform duration-500 group-hover:scale-[1.05]" />
        </Link>
        {product.discount > 0 && (
          <span className="absolute left-3 top-3 rounded-full bg-violet px-2.5 py-1 font-mono text-[10px] font-medium text-white">
            −{product.discount}%
          </span>
        )}
        <button onClick={() => wishlist.toggle(product._id)} aria-pressed={saved}
                aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-obsidian/70 text-cloud backdrop-blur hover:bg-obsidian">
          <Heart size={16} className={saved ? 'fill-violet text-violet' : ''} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-silver">
          {product.subcategory || product.category}
        </span>
        <h3 className="text-[15px] font-medium leading-snug text-cloud">
          <Link to={href} className="line-clamp-2 hover:text-lavender">{product.name}</Link>
        </h3>
        {(product.explanation?.summary ?? product.reason) && (
          <p className="line-clamp-2 text-xs text-cyan/90">{product.explanation?.summary ?? product.reason}</p>
        )}
        {product.explanation && <WhyThis explanation={product.explanation} />}

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-semibold text-cloud">{formatINR(price)}</span>
            {product.discount > 0 && <span className="text-xs text-silver line-through">{formatINR(product.price)}</span>}
          </div>
          {product.rating > 0 && (
            <span className="flex items-center gap-1 text-xs text-silver"
                  title={product.rating_count ? `Rating derived from ${product.rating_count} buyers` : undefined}>
              <Star size={12} className="fill-lavender text-lavender" aria-hidden />
              <span className="text-cloud">{product.rating}</span>
              {!!product.rating_count && <span>({product.rating_count.toLocaleString('en-IN')})</span>}
            </span>
          )}
        </div>
        {stock && <span className={`text-[11px] ${stock.tone}`}>{stock.label}</span>}

        <div className="mt-2 flex items-center gap-2">
          {onAdd && (
            <button onClick={() => onAdd(product)} disabled={adding || product.inventory === 0}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-cloud py-2.5 text-xs font-semibold text-obsidian hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
              {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {adding ? 'Adding…' : 'Add to cart'}
            </button>
          )}
          {compare && (
            <button onClick={() => compareList.toggle(product._id)} aria-pressed={comparing}
                    disabled={!comparing && compareList.full}
                    title={!comparing && compareList.full ? 'You can compare up to 3 products' : undefined}
                    aria-label={comparing ? `Remove ${product.name} from comparison` : `Compare ${product.name}`}
                    className={`flex h-[38px] items-center gap-1 rounded-full border px-3 text-xs font-medium disabled:opacity-40 ${
                      comparing ? 'border-cyan/60 bg-cyan/10 text-cyan' : 'border-line text-silver hover:border-lavender/50 hover:text-cloud'
                    }`}>
              <GitCompareArrows size={13} /> {onAdd ? '' : 'Compare'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
