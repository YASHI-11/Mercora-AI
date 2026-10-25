import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, X, Search, Sparkles, GitCompareArrows, ChevronRight, Star, Check } from 'lucide-react'
import { useCategories, useProducts, useAddToCart, type CategoryInfo, type ProductQuery } from '../hooks/useCatalog'
import { useCompare } from '../hooks/useStoredIds'
import ProductCard from '../components/ProductCard'
import ProductImage from '../components/ProductImage'
import { ErrorState, EmptyState } from '../components/StateViews'

const PAGE = 24

// Every option sorts on a real catalogue field.
const SORTS = [
  { value: 'popular', label: 'Popularity' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest' },
]
const RATINGS = [4.5, 4, 3]

export default function Shop() {
  const [params, setParams] = useSearchParams()
  const [drawer, setDrawer] = useState(false)
  const [paging, setPaging] = useState({ key: '', limit: PAGE })
  const { data: cats } = useCategories()
  const { add, pendingId } = useAddToCart()
  const compare = useCompare()

  const category = params.get('category') ?? ''
  const subcategory = params.get('subcategory') ?? ''
  const q = params.get('q') ?? ''
  const sort = params.get('sort') ?? 'popular'
  const minPrice = params.get('min_price') ?? ''
  const maxPrice = params.get('max_price') ?? ''
  const minRating = params.get('min_rating') ?? ''
  const inStock = params.get('in_stock') === '1'

  // Paging belongs to one filter set: changing filters starts from page one.
  const filterKey = params.toString()
  const limit = paging.key === filterKey ? paging.limit : PAGE

  const query: ProductQuery = {
    category: category || undefined, subcategory: subcategory || undefined, q: q || undefined,
    // $text search has its own relevance order; an explicit sort overrides it.
    sort: q && !params.get('sort') ? undefined : sort,
    min_price: minPrice ? Number(minPrice) : undefined, max_price: maxPrice ? Number(maxPrice) : undefined,
    min_rating: minRating ? Number(minRating) : undefined, in_stock: inStock || undefined, limit,
  }
  const { data, isLoading, isFetching, error } = useProducts(query)

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const taxonomy = cats?.taxonomy ?? []
  const current = taxonomy.find((t) => t.category === category)
  const subcats = current?.subcategories ?? []
  const chips = [
    q && { key: 'q', label: `“${q}”` },
    category && { key: 'category', label: category, clear: { category: null, subcategory: null } },
    subcategory && { key: 'subcategory', label: subcategory },
    (minPrice || maxPrice) && { key: 'price', label: `₹${minPrice || 0} – ${maxPrice ? `₹${maxPrice}` : 'any'}`, clear: { min_price: null, max_price: null } },
    minRating && { key: 'min_rating', label: `${minRating}★ & up` },
    inStock && { key: 'in_stock', label: 'In stock' },
  ].filter(Boolean) as { key: string; label: string; clear?: Record<string, null> }[]

  const title = subcategory || category || (q ? 'Search results' : 'The catalogue')
  const shown = data?.products.length ?? 0
  // Cards from earlier pages are already on screen; only a new page animates.
  const firstNew = Math.max(0, limit - PAGE)

  const filters = (
    <Filters category={category} subcategory={subcategory} subcats={subcats}
             categories={taxonomy} minPrice={minPrice} maxPrice={maxPrice}
             minRating={minRating} inStock={inStock} update={update} />
  )

  return (
    <div className="ambient">
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-silver">
          <Link to="/" className="hover:text-cloud">Home</Link>
          <ChevronRight size={12} aria-hidden />
          <Link to="/shop" className={category ? 'hover:text-cloud' : 'text-cloud'}>Shop</Link>
          {category && (<><ChevronRight size={12} aria-hidden />
            <button onClick={() => update({ subcategory: null })} className={subcategory ? 'hover:text-cloud' : 'text-cloud'}>{category}</button></>)}
          {subcategory && (<><ChevronRight size={12} aria-hidden /><span className="text-cloud">{subcategory}</span></>)}
        </nav>

        <header className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="eyebrow">{category ? 'Collection' : q ? 'Search' : `${taxonomy.length || ''} collections`.trim()}</p>
            <h1 className="mt-3 text-4xl font-semibold text-cloud sm:text-6xl">{title}</h1>
            <p className="mt-3 text-sm text-silver">
              {current && !subcategory
                ? `${current.count.toLocaleString('en-IN')} products across ${subcats.length} ranges.`
                : 'Every product with its real price, stock and buyer rating.'}
            </p>
          </div>
          <Link to="/assistant" className="inline-flex items-center gap-2 rounded-full border border-line bg-graphite/60 px-4 py-2.5 text-sm text-lavender backdrop-blur hover:border-lavender/50 hover:text-cloud">
            <Sparkles size={15} aria-hidden /> Describe it to the AI assistant
          </Link>
        </header>

        {category
          ? subcats.length > 0 && <RangeRail subcats={subcats} active={subcategory} onPick={(s) => update({ subcategory: subcategory === s ? null : s })} />
          : !q && taxonomy.length > 0 && <CollectionRail taxonomy={taxonomy} onPick={(c) => update({ category: c, subcategory: null })} />}

        {/* Sticky toolbar under the store nav (h-16). */}
        <div className="glass sticky top-16 z-30 -mx-4 mt-8 border-y border-line px-4 py-3 sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <SearchBox key={q} initial={q} onSearch={(v) => update({ q: v || null })} />
            <p className="hidden text-xs text-silver sm:block" aria-live="polite">
              {data ? <><span className="tabular-nums text-cloud">{data.total.toLocaleString('en-IN')}</span> products</> : 'Loading…'}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setDrawer(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm text-cloud lg:hidden">
                <SlidersHorizontal size={14} /> Filters{chips.length > 0 && ` (${chips.length})`}
              </button>
              <label className="flex items-center gap-2 text-xs text-silver">
                <span className="hidden sm:inline">Sort</span>
                <select value={q && !params.get('sort') ? '' : sort} onChange={(e) => update({ sort: e.target.value || null })}
                        className="rounded-full border border-line bg-graphite px-3 py-2 text-sm text-cloud outline-none focus:border-lavender/60">
                  {q && <option value="">Best match</option>}
                  {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            </div>
          </div>
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <button key={c.key} onClick={() => update(c.clear ?? { [c.key]: null })}
                        aria-label={`Remove filter ${c.label}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-violet/30 bg-violet/10 px-3 py-1.5 text-xs text-cloud hover:border-violet/60">
                  {c.label} <X size={12} className="text-violet" />
                </button>
              ))}
              <button onClick={() => setParams(new URLSearchParams(sort !== 'popular' ? { sort } : {}), { replace: true })}
                      className="text-xs text-silver underline-offset-2 hover:text-cloud hover:underline">Clear all</button>
            </div>
          )}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[240px_1fr]">
          <aside aria-label="Filters" className="hidden lg:block">{filters}</aside>

          <div>
            {error && <ErrorState message={(error as Error).message} />}
            {isLoading && <GridSkeleton />}
            {data && data.products.length === 0 && (
              <EmptyState title="No products match these filters" subtitle="Remove a filter, or describe what you need to the AI assistant." />
            )}
            {data && data.products.length > 0 && (
              <>
                <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 transition-opacity ${isFetching ? 'opacity-70' : ''}`}>
                  {data.products.map((p, i) => (
                    <div key={p._id} className={i >= firstNew ? 'rise-in grid' : 'grid'}
                         style={i >= firstNew ? { animationDelay: `${Math.min(i - firstNew, 11) * 40}ms` } : undefined}>
                      <ProductCard product={p} onAdd={add} adding={pendingId === p._id} compare />
                    </div>
                  ))}
                </div>
                <div className="mx-auto mt-12 max-w-sm text-center">
                  <p className="text-xs text-silver">
                    Showing <span className="tabular-nums text-cloud">{shown.toLocaleString('en-IN')}</span> of{' '}
                    <span className="tabular-nums text-cloud">{data.total.toLocaleString('en-IN')}</span>
                  </p>
                  <div className="mt-2 h-px overflow-hidden rounded-full bg-line">
                    <div className="h-full bg-lavender transition-[width] duration-500" style={{ width: `${(shown / data.total) * 100}%` }} />
                  </div>
                  {shown < data.total && (
                    <button onClick={() => setPaging({ key: filterKey, limit: limit + PAGE })} disabled={isFetching}
                            className="mt-5 rounded-full border border-line px-6 py-3 text-sm font-medium text-cloud hover:border-lavender/60 hover:bg-tint/5 disabled:opacity-50">
                      {isFetching ? 'Loading…' : `Show ${Math.min(PAGE, data.total - shown)} more`}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {drawer && (
        <div role="dialog" aria-modal="true" aria-label="Filters" className="fixed inset-0 z-[65] lg:hidden">
          <div className="absolute inset-0 bg-obsidian/70 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-sm overflow-y-auto border-r border-line bg-graphite p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-cloud">Filters</h2>
              <button onClick={() => setDrawer(false)} aria-label="Close filters" className="flex h-9 w-9 items-center justify-center rounded-full text-silver hover:bg-tint/5">
                <X size={18} />
              </button>
            </div>
            {filters}
            <button onClick={() => setDrawer(false)} className="mt-6 w-full rounded-full bg-cloud py-3 text-sm font-semibold text-obsidian">
              Show {data?.total.toLocaleString('en-IN') ?? ''} products
            </button>
          </div>
        </div>
      )}

      {compare.ids.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="glass flex items-center gap-3 rounded-full border border-lavender/30 py-2 pl-5 pr-2 shadow-2xl shadow-shade/50">
            <GitCompareArrows size={16} className="text-lavender" aria-hidden />
            <span className="text-sm text-cloud">{compare.ids.length} of 3 selected</span>
            <button onClick={compare.clear} className="text-xs text-silver hover:text-cloud">Clear</button>
            <Link to="/compare" className={`rounded-full px-4 py-2 text-sm font-semibold ${
              compare.ids.length > 1 ? 'bg-cloud text-obsidian hover:bg-cloud-strong' : 'pointer-events-none bg-tint/10 text-silver'
            }`} aria-disabled={compare.ids.length < 2}>
              Compare
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

/** Every collection as an image tile: browsing by picture, not by list. */
function CollectionRail({ taxonomy, onPick }: { taxonomy: CategoryInfo[]; onPick: (category: string) => void }) {
  return (
    <div className="-mx-4 mt-8 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_88%,transparent)] sm:-mx-6 sm:px-6">
      <ul className="flex gap-3 pr-16">
        {taxonomy.map((c, i) => (
          <li key={c.category} className="rise-in shrink-0" style={{ animationDelay: `${i * 35}ms` }}>
            <button onClick={() => onPick(c.category)}
                    className="group relative block h-40 w-44 overflow-hidden rounded-2xl border border-line text-left hover:border-lavender/50">
              <ProductImage src={c.image} name={c.category} category={c.category}
                            className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-[1.06]" />
              {/* Text over a photo: an ink scrim with paper-coloured text. */}
              <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-cloud/85 via-cloud/35 to-transparent" />
              <span className="absolute inset-x-3 bottom-3">
                <span className="block text-sm font-semibold leading-tight text-obsidian">{c.category}</span>
                <span className="mt-0.5 block font-mono text-[10px] tracking-[0.1em] text-obsidian/80">{c.count.toLocaleString('en-IN')} PRODUCTS</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RangeRail({ subcats, active, onPick }: { subcats: string[]; active: string; onPick: (s: string) => void }) {
  return (
    <div className="-mx-4 mt-8 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6">
      <ul className="flex gap-2">
        {subcats.map((s) => (
          <li key={s} className="shrink-0">
            <button onClick={() => onPick(s)} aria-pressed={active === s}
                    className={`rounded-full border px-4 py-2 text-sm ${
                      active === s ? 'border-violet/60 bg-violet/15 text-cloud' : 'border-line bg-graphite/60 text-silver hover:border-lavender/50 hover:text-cloud'
                    }`}>
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SearchBox({ initial, onSearch }: { initial: string; onSearch: (v: string) => void }) {
  const [value, setValue] = useState(initial)
  function submit(e: FormEvent) {
    e.preventDefault()
    onSearch(value.trim())
  }
  return (
    <form onSubmit={submit} role="search" className="flex min-w-[220px] max-w-md flex-1 items-center gap-2 rounded-full border border-line bg-obsidian/60 px-4 focus-within:border-lavender/60">
      <Search size={16} className="text-silver" aria-hidden />
      <label htmlFor="shop-search" className="sr-only">Search products</label>
      <input id="shop-search" type="search" value={value} onChange={(e) => setValue(e.target.value)}
             placeholder="Search the catalogue…" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-cloud placeholder:text-silver/70 outline-none" />
    </form>
  )
}

function Filters({ category, subcategory, subcats, categories, minPrice, maxPrice, minRating, inStock, update }: {
  category: string; subcategory: string; subcats: string[]
  categories: { category: string; count: number }[]
  minPrice: string; maxPrice: string; minRating: string; inStock: boolean
  update: (c: Record<string, string | null>) => void
}) {
  // Active options carry the kraft marker, the page's one warm cue.
  const option = (active: boolean) =>
    `relative flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
      active ? 'bg-tint/[0.05] text-cloud before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-violet'
             : 'text-silver hover:bg-tint/[0.04] hover:text-cloud'
    }`

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="eyebrow mb-3">Collection</legend>
        <button onClick={() => update({ category: null, subcategory: null })} className={option(!category)}>All collections</button>
        {categories.map((c) => (
          <button key={c.category} onClick={() => update({ category: c.category, subcategory: null })}
                  aria-pressed={category === c.category} className={option(category === c.category)}>
            <span>{c.category}</span><span className="font-mono text-[11px] text-silver">{c.count}</span>
          </button>
        ))}
      </fieldset>

      {subcats.length > 0 && (
        <fieldset>
          <legend className="eyebrow mb-3">Range</legend>
          {subcats.map((s) => (
            <button key={s} onClick={() => update({ subcategory: subcategory === s ? null : s })}
                    aria-pressed={subcategory === s} className={option(subcategory === s)}>{s}</button>
          ))}
        </fieldset>
      )}

      <fieldset>
        <legend className="eyebrow mb-3">Price (₹)</legend>
        <PriceRange key={`${minPrice}-${maxPrice}`} minPrice={minPrice} maxPrice={maxPrice}
                    onApply={(lo, hi) => update({ min_price: lo || null, max_price: hi || null })} />
      </fieldset>

      <fieldset>
        <legend className="eyebrow mb-3">Buyer rating</legend>
        {RATINGS.map((r) => (
          <button key={r} onClick={() => update({ min_rating: minRating === String(r) ? null : String(r) })}
                  aria-pressed={minRating === String(r)} aria-label={`${r} stars and up`} className={option(minRating === String(r))}>
            <span className="flex items-center gap-1.5">
              <Star size={13} className="fill-lavender text-lavender" aria-hidden />
              <span className="tabular-nums">{r}</span><span className="text-silver">& up</span>
            </span>
          </button>
        ))}
      </fieldset>

      <fieldset>
        <legend className="eyebrow mb-3">Availability</legend>
        <button role="switch" aria-checked={inStock} onClick={() => update({ in_stock: inStock ? null : '1' })}
                className={option(inStock)}>
          In stock only
          <span className={`flex h-4 w-4 items-center justify-center rounded border ${inStock ? 'border-violet bg-violet text-on-accent' : 'border-line'}`}>
            {inStock && <Check size={11} strokeWidth={3} aria-hidden />}
          </span>
        </button>
      </fieldset>
    </div>
  )
}

function PriceRange({ minPrice, maxPrice, onApply }: {
  minPrice: string; maxPrice: string; onApply: (lo: string, hi: string) => void
}) {
  const [lo, setLo] = useState(minPrice)
  const [hi, setHi] = useState(maxPrice)
  const input = 'w-full rounded-lg border border-line bg-obsidian/60 px-3 py-2 text-sm text-cloud outline-none focus:border-lavender/60'
  return (
    <form onSubmit={(e) => { e.preventDefault(); onApply(lo, hi) }} className="flex items-center gap-2">
      <input type="number" min={0} inputMode="numeric" value={lo} onChange={(e) => setLo(e.target.value)}
             aria-label="Minimum price" placeholder="Min" className={input} />
      <span className="text-silver">–</span>
      <input type="number" min={0} inputMode="numeric" value={hi} onChange={(e) => setHi(e.target.value)}
             aria-label="Maximum price" placeholder="Max" className={input} />
      <button type="submit" className="rounded-lg border border-line px-3 py-2 text-sm text-cloud hover:border-lavender/50 hover:bg-tint/5">Go</button>
    </form>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse overflow-hidden rounded-2xl border border-line bg-graphite">
          <div className="aspect-square bg-graphite-2" />
          <div className="space-y-2 p-4"><div className="h-3 w-1/3 rounded bg-line" /><div className="h-4 w-4/5 rounded bg-line" /></div>
        </div>
      ))}
    </div>
  )
}
