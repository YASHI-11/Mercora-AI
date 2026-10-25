import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Star, Minus, Plus, Heart, Maximize2, X, Sparkles, ChevronRight, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAddToCart, formatINR, finalPrice, availability } from '../hooks/useCatalog'
import { useWishlist } from '../hooks/useStoredIds'
import ProductCard from '../components/ProductCard'
import ProductImage from '../components/ProductImage'
import { LoadingState, ErrorState } from '../components/StateViews'
import type { Product } from '../types'

type Tab = 'overview' | 'specs' | 'ratings'

// Keyed by product id so quantity/tab state starts fresh for every product
// (ScrollManager in App.tsx handles scrolling to the top).
export default function ProductDetail() {
  const { id } = useParams()
  return <ProductView key={id} id={id} />
}

function ProductView({ id }: { id?: string }) {
  const navigate = useNavigate()
  const { add, pendingId } = useAddToCart()
  const wishlist = useWishlist()
  const [qty, setQty] = useState(1)
  const [tab, setTab] = useState<Tab>('overview')
  const [fullscreen, setFullscreen] = useState(false)

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => (await api.get<Product>(`/products/${id}`)).data,
  })
  const { data: recs } = useQuery({
    queryKey: ['recommendations', id],
    queryFn: async () => (await api.get<{ similar: Product[]; cross_sell: Product[] }>(`/recommendations/${id}`)).data,
    enabled: !!id,
  })

  if (isLoading) return <LoadingState label="Loading product…" />
  if (error || !product) return <ErrorState message="Product not found." />

  const price = finalPrice(product)
  const stock = availability(product)
  const maxQty = Math.max(1, Math.min(product.inventory ?? 99, 99))
  const soldOut = product.inventory === 0
  const saved = wishlist.has(product._id)
  // Without a mined rule the backend falls back to similar products, which
  // "You may also like" already shows -- only real co-purchases belong here.
  const boughtTogether = recs?.cross_sell.filter((p) => p.explanation?.method === 'co_purchase') ?? []

  async function buyNow() {
    if (await add(product!, qty)) navigate('/checkout')
  }

  const specs: [string, string][] = [
    ['Category', product.category],
    ['Range', product.subcategory ?? '—'],
    ['Brand', product.brand],
    ['Product code', product._id.replace(/^prod_retail_/, '')],
    ...(product.features?.length ? [['Details', product.features.join(', ')] as [string, string]] : []),
    ...(product.units_sold ? [['Units sold', product.units_sold.toLocaleString('en-IN')] as [string, string]] : []),
    ...(product.inventory != null ? [['In stock', String(product.inventory)] as [string, string]] : []),
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-silver">
        <Link to="/" className="hover:text-cloud">Home</Link>
        <ChevronRight size={12} aria-hidden />
        <Link to={`/shop?category=${encodeURIComponent(product.category)}`} className="hover:text-cloud">{product.category}</Link>
        {product.subcategory && (<>
          <ChevronRight size={12} aria-hidden />
          <Link to={`/shop?category=${encodeURIComponent(product.category)}&subcategory=${encodeURIComponent(product.subcategory)}`}
                className="hover:text-cloud">{product.subcategory}</Link>
        </>)}
      </nav>

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[58fr_42fr]">
        {/* Gallery */}
        <div>
          <ZoomImage product={product} onFullscreen={() => setFullscreen(true)} />
          {product.image && product.image_credit && (
            <p className="mt-3 text-[11px] leading-snug text-silver/80">
              Illustrative photo of this product type:{' '}
              <a href={product.image_credit.source} target="_blank" rel="noreferrer" className="underline hover:text-cloud">
                {product.image_credit.author}
              </a>, {product.image_credit.license}, via Wikimedia Commons
            </p>
          )}
        </div>

        {/* Purchase panel */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lavender">{product.subcategory || product.category}</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight text-cloud sm:text-4xl">{product.name}</h1>
          {product.rating > 0 && (
            <button onClick={() => { setTab('ratings'); document.getElementById('details')?.scrollIntoView({ behavior: 'smooth' }) }}
                    className="mt-3 flex items-center gap-1.5 text-sm text-silver hover:text-cloud">
              <Star size={15} className="fill-lavender text-lavender" aria-hidden />
              <span className="text-cloud">{product.rating}</span>
              {product.rating_imputed ? <span>(estimated)</span>
                : !!product.rating_count && <span>from {product.rating_count.toLocaleString('en-IN')} buyers</span>}
            </button>
          )}

          <div className="mt-6 flex items-baseline gap-3">
            <span className="text-4xl font-semibold text-cloud">{formatINR(price)}</span>
            {product.discount > 0 && (<>
              <span className="text-base text-silver line-through">{formatINR(product.price)}</span>
              <span className="rounded-full bg-violet/20 px-2.5 py-1 text-xs font-medium text-lavender">{product.discount}% off</span>
            </>)}
          </div>
          <p className="mt-1 text-xs text-silver">Inclusive of all taxes · INR</p>

          <p className="mt-5 leading-relaxed text-silver">{product.description}</p>
          {stock && <p className={`mt-4 text-sm font-medium ${stock.tone}`}>{stock.label}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-full border border-line" role="group" aria-label="Quantity">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity"
                      className="flex h-12 w-11 items-center justify-center text-silver hover:text-cloud disabled:opacity-40"><Minus size={15} /></button>
              <span className="w-8 text-center text-sm text-cloud" aria-live="polite">{qty}</span>
              <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} aria-label="Increase quantity"
                      className="flex h-12 w-11 items-center justify-center text-silver hover:text-cloud disabled:opacity-40"><Plus size={15} /></button>
            </div>
            <button onClick={() => add(product, qty)} disabled={soldOut || pendingId === product._id}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-cloud px-6 text-sm font-semibold text-obsidian hover:bg-cloud-strong disabled:opacity-50">
              {pendingId === product._id && <Loader2 size={15} className="animate-spin" />} Add to cart
            </button>
            <button onClick={buyNow} disabled={soldOut || pendingId === product._id}
                    className="h-12 flex-1 rounded-full bg-violet px-6 text-sm font-semibold text-on-accent hover:bg-violet/90 disabled:opacity-50">
              Buy now
            </button>
            <button onClick={() => wishlist.toggle(product._id)} aria-pressed={saved}
                    aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-line text-cloud hover:border-lavender/60">
              <Heart size={17} className={saved ? 'fill-violet text-violet' : ''} />
            </button>
          </div>

          <Link to={`/assistant?q=${encodeURIComponent(`products like ${product.name.toLowerCase()}`)}`}
                className="mt-6 flex items-center gap-3 rounded-2xl border border-line bg-graphite p-4 hover:border-lavender/50">
            <Sparkles size={18} className="shrink-0 text-lavender" aria-hidden />
            <span className="text-sm">
              <span className="block text-cloud">Not quite right?</span>
              <span className="text-silver">Ask the AI assistant for alternatives to this {product.subcategory?.toLowerCase() ?? 'product'}.</span>
            </span>
          </Link>
        </div>
      </div>

      {/* Details */}
      <section id="details" aria-label="Product information" className="mt-16 scroll-mt-24">
        <div role="tablist" aria-label="Product information" className="flex gap-1 border-b border-line">
          {([['overview', 'Overview'], ['specs', 'Specifications'], ['ratings', 'Ratings']] as [Tab, string][]).map(([key, label]) => (
            <button key={key} role="tab" id={`tab-${key}`} aria-selected={tab === key} aria-controls={`panel-${key}`}
                    onClick={() => setTab(key)}
                    className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium ${
                      tab === key ? 'border-cyan text-cloud' : 'border-transparent text-silver hover:text-cloud'
                    }`}>
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="max-w-3xl py-8">
          {tab === 'overview' && (
            <div className="space-y-4 text-silver">
              <p className="leading-relaxed">{product.description}</p>
              {product.features?.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {product.features.map((f) => (
                    <li key={f} className="rounded-full border border-line px-3 py-1.5 text-xs text-cloud">{f}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {tab === 'specs' && (
            <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {specs.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[150px_1fr] gap-4 px-5 py-3.5 text-sm">
                  <dt className="text-silver">{k}</dt><dd className="text-cloud">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {tab === 'ratings' && (
            <div className="rounded-2xl border border-line bg-graphite p-6">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-semibold text-cloud">{product.rating}</span>
                <span className="text-silver">/ 5</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-silver">
                {product.rating_imputed
                  ? `Too few customers have bought this product to rate it yet, so this is the median rating of the ${product.category} category.`
                  : `Derived from the purchase behaviour of ${product.rating_count?.toLocaleString('en-IN') ?? 'its'} buyers — products customers come back to buy again rate higher.`}
              </p>
              <p className="mt-3 text-sm text-silver">There are no written reviews for this product yet.</p>
            </div>
          )}
        </div>
      </section>

      {boughtTogether.length > 0 && (
        <section aria-labelledby="fbt" className="mt-12">
          <h2 id="fbt" className="text-2xl font-semibold text-cloud">Frequently bought together</h2>
          <p className="mb-6 mt-1 text-sm text-silver">
            Association rules mined from real baskets of customers who bought this. Open “Why this?” for the numbers.
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {boughtTogether.map((p) => <ProductCard key={p._id} product={p} onAdd={add} adding={pendingId === p._id} />)}
          </div>
        </section>
      )}
      {recs && recs.similar.length > 0 && (
        <section aria-labelledby="similar" className="mt-16">
          <h2 id="similar" className="text-2xl font-semibold text-cloud">You may also like</h2>
          <p className="mb-6 mt-1 text-sm text-silver">Products with the most similar descriptions, by TF-IDF text similarity.</p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {recs.similar.slice(0, 8).map((p) => <ProductCard key={p._id} product={p} onAdd={add} adding={pendingId === p._id} />)}
          </div>
        </section>
      )}

      {fullscreen && <Lightbox product={product} onClose={() => setFullscreen(false)} />}
    </div>
  )
}

function ZoomImage({ product, onFullscreen }: { product: Product; onFullscreen: () => void }) {
  const frame = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null)

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' || !product.image) return
    const r = frame.current!.getBoundingClientRect()
    setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
  }

  return (
    <div className="relative">
      <div ref={frame} onPointerMove={onMove} onPointerLeave={() => setZoom(null)}
           className="relative aspect-square overflow-hidden rounded-3xl border border-line bg-graphite-2">
        <div className="h-full w-full transition-transform duration-200 ease-out"
             style={zoom ? { transform: 'scale(1.9)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}>
          <ProductImage src={product.image} name={product.name} category={product.category}
                        subcategory={product.subcategory} className="h-full w-full" />
        </div>
      </div>
      {product.image && (
        <button onClick={onFullscreen} aria-label="View image full screen"
                className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-obsidian/75 text-cloud backdrop-blur hover:bg-obsidian">
          <Maximize2 size={16} />
        </button>
      )}
    </div>
  )
}

function Lightbox({ product, onClose }: { product: Product; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label={`${product.name} image`}
         className="fixed inset-0 z-[80] flex items-center justify-center bg-obsidian/95 p-4" onClick={onClose}>
      <img src={product.image} alt={product.name} className="max-h-full max-w-full rounded-2xl object-contain"
           onClick={(e) => e.stopPropagation()} />
      <button ref={closeRef} onClick={onClose} aria-label="Close"
              className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full bg-graphite text-cloud hover:bg-graphite-2">
        <X size={20} />
      </button>
    </div>
  )
}
