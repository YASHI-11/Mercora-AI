import type { RefObject } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Plus, Star } from 'lucide-react'
import MercoraIntro from '../intro/MercoraIntro'
import type { FieldHandle } from './FragmentField'
import ProductCard from '../../ProductCard'
import ProductImage from '../../ProductImage'
import {
  useCategories, useProducts, useAddToCart, formatINR, finalPrice, availability,
} from '../../../hooks/useCatalog'
import type { Product } from '../../../types'

// The homepage's DOM layer. The fragment canvas (FragmentField) sits behind
// all of it; these sections provide the scroll distance (tall sections with
// sticky stages, only when motion is allowed) and the text, products and
// controls that the fragments' formations introduce. Animated elements carry
// class hooks targeted by the timelines in Landing.tsx.

const stage = 'motion-safe:sticky top-0 flex h-[100svh] items-center overflow-hidden'

// ------------------------------------------------- 01 · fragments recollect

export function RecollectScene({ field, onIntroDone }: { field: RefObject<FieldHandle | null>; onIntroDone: () => void }) {
  return (
    // -mt-16 tucks the opening under the sticky nav so it fills the screen.
    <section className="scene-recollect relative -mt-16 motion-safe:h-[260svh]">
      <div className="motion-safe:sticky top-0 h-[100svh]">
        <MercoraIntro field={field} onDone={onIntroDone} />
        <p className="recollect-caption pointer-events-none absolute inset-x-0 bottom-[12svh] px-4 text-center font-mono text-[11px] tracking-[0.32em] text-[#B9DFFF]">
          EVERY ORDER BEGINS AS A SINGLE PACKAGE
        </p>
      </div>
    </section>
  )
}

// ------------------------------------------------ 02 · the box moves

export function BoxScene() {
  return (
    <section aria-label="The package" className="scene-box relative motion-safe:h-[280svh]">
      <div className={stage}>
        <div className="mx-auto grid w-full max-w-7xl gap-16 px-4 py-24 sm:px-6 motion-safe:block motion-safe:py-0">
          <div className="box-c1 max-w-lg motion-safe:absolute motion-safe:top-1/2 motion-safe:-translate-y-1/2">
            <p className="eyebrow !text-[#B9DFFF]">01 · The package</p>
            <h2 className="display-section mt-4 font-semibold text-white">Every delivery starts as a simple box.</h2>
            <p className="mt-5 max-w-md text-white/60">Plain, sealed, the same as every other on the truck.</p>
          </div>
          <div className="box-c2 max-w-lg motion-safe:absolute motion-safe:bottom-[12svh]">
            <p className="eyebrow !text-[#B9DFFF]">02 · The transformation</p>
            <h2 className="display-section mt-4 font-semibold text-white">Mercora AI turns it into something new.</h2>
            <p className="mt-5 max-w-md text-white/60">Every outline comes apart, finds a new place, and builds something larger.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

// ----------------------------------------------- 03 · a new world

export function WorldScene() {
  const { data } = useCategories()
  const products = data?.taxonomy.reduce((n, c) => n + c.count, 0)
  const ranges = data?.taxonomy.reduce((n, c) => n + c.subcategories.length, 0)
  return (
    <section aria-label="A new world" className="scene-world relative motion-safe:h-[220svh]">
      <div className={stage}>
        <div className="world-copy mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 motion-safe:absolute motion-safe:inset-x-0 motion-safe:bottom-[10svh] motion-safe:py-0">
          <div className="max-w-xl rounded-3xl bg-[radial-gradient(closest-side,rgba(7,20,38,0.85),transparent)] py-6">
            <p className="eyebrow !text-[#B9DFFF]">03 · A new world</p>
            <h2 className="display-section mt-4 font-semibold text-white">A universe of products, rebuilt around you.</h2>
            {data && (
              <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
                {[[products, 'products'], [data.taxonomy.length, 'collections'], [ranges, 'ranges']].map(([n, label]) => (
                  <div key={label}>
                    <dt className="sr-only">{label}</dt>
                    <dd className="font-grotesk text-3xl font-semibold text-white">{n?.toLocaleString('en-IN')}</dd>
                    <dd className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">{label}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// -------------------------------------------- 04 · fragments form products

// Each outline stands for a real catalogue range; beside it, a genuine
// product from that range (its real photo, name, price and links).
const FORMS = [
  { outline: 'a lantern', subcategory: 'Lighting & Candles', category: 'Home Decor', side: 'right' },
  { outline: 'a teapot', subcategory: 'Mugs & Teaware', category: 'Kitchen & Dining', side: 'left' },
  { outline: 'a necklace', subcategory: 'Necklaces', category: 'Fashion & Jewellery', side: 'right' },
] as const

function FormCard({ form, product, index }: { form: (typeof FORMS)[number]; product?: Product; index: number }) {
  const { add, pendingId } = useAddToCart()
  const stock = product ? availability(product) : null
  const position = form.side === 'right' ? 'motion-safe:right-[6vw]' : 'motion-safe:left-[6vw]'
  return (
    <article data-form={index}
             className={`form-card w-full max-w-sm rounded-3xl border border-white/10 bg-[#0B1D35]/85 p-5 backdrop-blur motion-safe:absolute motion-safe:top-1/2 motion-safe:-translate-y-1/2 ${position}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#B9DFFF]">
        Outline: {form.outline} · {form.subcategory}
      </p>
      <p className="mt-1 text-xs text-white/45">An abstract shape for the range. A real product from it:</p>
      {product ? (
        <>
          <Link to={`/shop/product/${product._id}`} className="mt-4 block overflow-hidden rounded-2xl">
            <ProductImage src={product.image} name={product.name} category={product.category}
                          subcategory={product.subcategory} className="aspect-[4/3] w-full" />
          </Link>
          <h3 className="mt-4 text-lg font-semibold leading-snug text-white">
            <Link to={`/shop/product/${product._id}`} className="hover:text-[#B9DFFF]">{product.name}</Link>
          </h3>
          <div className="mt-2 flex items-center gap-4 text-sm">
            <span className="text-xl font-semibold text-white">{formatINR(finalPrice(product))}</span>
            {product.rating > 0 && (
              <span className="flex items-center gap-1 text-white/60">
                <Star size={13} className="fill-[#B9DFFF] text-[#B9DFFF]" aria-hidden /> {product.rating}
              </span>
            )}
            {stock && <span className={`text-xs ${stock.tone}`}>{stock.label}</span>}
          </div>
          <div className="mt-4 flex gap-2">
            <Link to={`/shop/product/${product._id}`}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white py-2.5 text-sm font-semibold text-[#071426] hover:bg-[#B9DFFF]">
              View product <ArrowRight size={14} />
            </Link>
            <button onClick={() => add(product)} disabled={pendingId === product._id || product.inventory === 0}
                    aria-label={`Add ${product.name} to cart`}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white hover:border-white/50 disabled:opacity-50">
              <Plus size={16} />
            </button>
          </div>
          <Link to={`/shop?category=${encodeURIComponent(form.category)}&subcategory=${encodeURIComponent(form.subcategory)}`}
                className="mt-3 inline-flex items-center gap-1 text-xs text-white/55 hover:text-white">
            Explore {form.subcategory} <ArrowRight size={12} />
          </Link>
        </>
      ) : <div className="mt-4 aspect-[4/3] animate-pulse rounded-2xl bg-white/5" />}
    </article>
  )
}

export function FormsScene() {
  const lantern = useProducts({ subcategory: FORMS[0].subcategory, sort: 'popular', limit: 1, in_stock: true })
  const teapot = useProducts({ subcategory: FORMS[1].subcategory, sort: 'popular', limit: 1, in_stock: true })
  const necklace = useProducts({ subcategory: FORMS[2].subcategory, sort: 'popular', limit: 1, in_stock: true })
  const products = [lantern.data?.products[0], teapot.data?.products[0], necklace.data?.products[0]]
  return (
    <section aria-label="Products from the fragments" className="scene-forms relative motion-safe:h-[330svh]">
      <div className={stage}>
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-24 sm:px-6 md:grid-cols-3 motion-safe:block motion-safe:py-0">
          {FORMS.map((form, i) => <FormCard key={form.subcategory} form={form} product={products[i]} index={i} />)}
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------- 05 · the collection emerges

export function ShopScene() {
  const { data: cats } = useCategories()
  const { data: trending } = useProducts({ sort: 'popular', limit: 8, in_stock: true })
  const { add, pendingId } = useAddToCart()
  const collections = [...(cats?.taxonomy ?? [])].sort((a, b) => b.count - a.count)
  return (
    <section aria-labelledby="shop-title" className="scene-shop relative px-4 py-32 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="shop-head flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow !text-[#B9DFFF]">04 · The collection</p>
            <h2 id="shop-title" className="display-section mt-4 font-semibold text-white">Shop the collections.</h2>
          </div>
          <Link to="/collections" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#B9DFFF] hover:text-white">
            All collections <ArrowRight size={15} />
          </Link>
        </div>

        <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {collections.map((c) => (
            <li key={c.category} className="shop-coll">
              <Link to={`/shop?category=${encodeURIComponent(c.category)}`}
                    className="group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 p-4 hover:border-[#B9DFFF]/50">
                <ProductImage src={c.image} name={c.top_product || c.category} category={c.category}
                              className="absolute inset-0 -z-10 h-full w-full transition-transform duration-500 group-hover:scale-105" />
                <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-[#071426] via-[#071426]/50 to-transparent" />
                <span className="font-mono text-[10px] tracking-[0.18em] text-[#B9DFFF]">{c.count} PRODUCTS</span>
                <span className="mt-1 text-base font-semibold leading-tight text-white">{c.category}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs text-white/70">
                  Explore collection <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-20 flex items-end justify-between gap-4">
          <h3 className="text-2xl font-semibold text-white">Trending now</h3>
          <Link to="/shop?sort=popular" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#B9DFFF] hover:text-white">
            View all <ArrowRight size={15} />
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {(trending?.products ?? Array.from({ length: 8 }, () => undefined)).map((p, i) => (
            <div key={p?._id ?? i} className="shop-item">
              {p ? <ProductCard product={p} onAdd={add} adding={pendingId === p._id} />
                : <div className="aspect-[3/4] animate-pulse rounded-2xl border border-white/10 bg-white/5" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------- 07 · final reconstruction

export function FinalScene() {
  return (
    <section aria-label="Mercora AI" className="scene-final relative motion-safe:h-[240svh]">
      <div className={`${stage} justify-center`}>
        <div className="px-4 py-32 text-center motion-safe:py-0">
          <p className="font-grotesk font-bold leading-none tracking-[0.06em] text-white [font-size:clamp(2.6rem,10vw,8.5rem)]">
            <span className="sr-only">Mercora AI</span>
            <span aria-hidden className="inline-flex">
              {'MERCORA'.split('').map((ch, i) => <span key={i} className="final-letter inline-block">{ch}</span>)}
              <span className="inline-block w-[0.28em]" />
              {'AI'.split('').map((ch, i) => <span key={`a${i}`} className="final-letter inline-block text-[#B9DFFF]">{ch}</span>)}
            </span>
          </p>
          <p className="final-sub mt-6 font-mono text-xs tracking-[0.42em] text-[#B9DFFF]">SHOPPING, REIMAGINED.</p>
          <div className="final-cta mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/shop" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-[#071426] hover:bg-[#B9DFFF]">
              Shop the catalogue <ArrowRight size={16} />
            </Link>
            <Link to="/assistant" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-7 py-3.5 text-sm font-semibold text-white hover:border-white/60">
              Ask the AI assistant
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
