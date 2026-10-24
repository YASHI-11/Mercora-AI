import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, X, Search, Sparkles, GitCompareArrows, ChevronRight } from 'lucide-react'
import { useCategories, useProducts, useAddToCart, type ProductQuery } from '../hooks/useCatalog'
import { useCompare } from '../hooks/useStoredIds'
import ProductCard from '../components/ProductCard'
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

  const subcats = cats?.taxonomy.find((t) => t.category === category)?.subcategories ?? []
  const chips = [
    q && { key: 'q', label: `“${q}”` },
    category && { key: 'category', label: category, clear: { category: null, subcategory: null } },
    subcategory && { key: 'subcategory', label: subcategory },
    (minPrice || maxPrice) && { key: 'price', label: `₹${minPrice || 0} – ${maxPrice ? `₹${maxPrice}` : 'any'}`, clear: { min_price: null, max_price: null } },
    minRating && { key: 'min_rating', label: `${minRating}★ & up` },
    inStock && { key: 'in_stock', label: 'In stock' },
  ].filter(Boolean) as { key: string; label: string; clear?: Record<string, null> }[]

  const filters = (
    <Filters category={category} subcategory={subcategory} subcats={subcats}
             categories={cats?.taxonomy ?? []} minPrice={minPrice} maxPrice={maxPrice}
             minRating={minRating} inStock={inStock} update={update} />
  )

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-silver">
        <Link to="/" className="hover:text-cloud">Home</Link>
        <ChevronRight size={12} aria-hidden />
        <Link to="/shop" className={category ? 'hover:text-cloud' : 'text-cloud'}>Shop</Link>
        {category && (<><ChevronRight size={12} aria-hidden />
          <button onClick={() => update({ subcategory: null })} className={subcategory ? 'hover:text-cloud' : 'text-cloud'}>{category}</button></>)}
        {subcategory && (<><ChevronRight size={12} aria-hidden /><span className="text-cloud">{subcategory}</span></>)}
      </nav>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold text-cloud sm:text-5xl">{subcategory || category || (q ? 'Search results' : 'All products')}</h1>
          <p className="mt-2 text-sm text-silver" aria-live="polite">
            {data ? `${data.total.toLocaleString('en-IN')} product${data.total === 1 ? '' : 's'}` : 'Loading…'}
          </p>
        </div>
        <Link to="/assistant" className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm text-lavender hover:border-lavender/60 hover:text-cloud">
          <Sparkles size={14} /> Ask the AI assistant
        </Link>
      </div>

      <SearchBox key={q} initial={q} onSearch={(v) => update({ q: v || null })} />

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[250px_1fr]">
        <aside aria-label="Filters" className="hidden lg:block">{filters}</aside>

        <div>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <button onClick={() => setDrawer(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-sm text-cloud lg:hidden">
              <SlidersHorizontal size={14} /> Filters{chips.length > 0 && ` (${chips.length})`}
            </button>
            {chips.map((c) => (
              <button key={c.key} onClick={() => update(c.clear ?? { [c.key]: null })}
                      aria-label={`Remove filter ${c.label}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs text-cloud hover:bg-white/10">
                {c.label} <X size={12} />
              </button>
            ))}
            {chips.length > 0 && (
              <button onClick={() => setParams(new URLSearchParams(sort !== 'popular' ? { sort } : {}), { replace: true })}
                      className="text-xs text-silver underline-offset-2 hover:text-cloud hover:underline">Clear all</button>
            )}
            <label className="ml-auto flex items-center gap-2 text-xs text-silver">
              Sort
              <select value={q && !params.get('sort') ? '' : sort} onChange={(e) => update({ sort: e.target.value || null })}
                      className="rounded-full border border-line bg-graphite px-3 py-2 text-sm text-cloud outline-none focus:border-violet/60">
                {q && <option value="">Best match</option>}
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>

          {error && <ErrorState message={(error as Error).message} />}
          {isLoading && <GridSkeleton />}
          {data && data.products.length === 0 && (
            <EmptyState title="No products match these filters" subtitle="Remove a filter, or describe what you need to the AI assistant." />
          )}
          {data && data.products.length > 0 && (
            <>
              <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 ${isFetching ? 'opacity-70' : ''}`}>
                {data.products.map((p) => (
                  <ProductCard key={p._id} product={p} onAdd={add} adding={pendingId === p._id} compare />
                ))}
              </div>
              {data.products.length < data.total && (
                <div className="mt-10 text-center">
                  <button onClick={() => setPaging({ key: filterKey, limit: limit + PAGE })} disabled={isFetching}
                          className="rounded-full border border-line px-6 py-3 text-sm font-medium text-cloud hover:border-lavender/60 hover:bg-white/5 disabled:opacity-50">
                    {isFetching ? 'Loading…' : `Load more (${(data.total - data.products.length).toLocaleString('en-IN')} remaining)`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {drawer && (
        <div role="dialog" aria-modal="true" aria-label="Filters" className="fixed inset-0 z-[65] lg:hidden">
          <div className="absolute inset-0 bg-obsidian/70 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-sm overflow-y-auto border-r border-line bg-graphite p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-cloud">Filters</h2>
              <button onClick={() => setDrawer(false)} aria-label="Close filters" className="flex h-9 w-9 items-center justify-center rounded-full text-silver hover:bg-white/5">
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
          <div className="flex items-center gap-3 rounded-full border border-cyan/40 bg-graphite/95 py-2 pl-5 pr-2 shadow-2xl shadow-black/50 backdrop-blur">
            <GitCompareArrows size={16} className="text-cyan" aria-hidden />
            <span className="text-sm text-cloud">{compare.ids.length} of 3 selected</span>
            <button onClick={compare.clear} className="text-xs text-silver hover:text-cloud">Clear</button>
            <Link to="/compare" className={`rounded-full px-4 py-2 text-sm font-semibold ${
              compare.ids.length > 1 ? 'bg-cloud text-obsidian hover:bg-white' : 'pointer-events-none bg-white/10 text-silver'
            }`} aria-disabled={compare.ids.length < 2}>
              Compare
            </Link>
          </div>
        </div>
      )}
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
    <form onSubmit={submit} role="search" className="mt-6 flex max-w-xl items-center gap-2 rounded-full border border-line bg-graphite px-4 focus-within:border-violet/60">
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
  const option = (active: boolean) =>
    `flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm ${
      active ? 'bg-white/5 text-cloud' : 'text-silver hover:bg-white/5 hover:text-cloud'
    }`

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="eyebrow mb-3">Category</legend>
        <button onClick={() => update({ category: null, subcategory: null })} className={option(!category)}>All categories</button>
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
        <legend className="eyebrow mb-3">Rating</legend>
        {RATINGS.map((r) => (
          <button key={r} onClick={() => update({ min_rating: minRating === String(r) ? null : String(r) })}
                  aria-pressed={minRating === String(r)} className={option(minRating === String(r))}>
            {r}★ & up
          </button>
        ))}
      </fieldset>

      <fieldset>
        <legend className="eyebrow mb-3">Availability</legend>
        <label className="flex cursor-pointer items-center gap-2.5 px-2.5 text-sm text-silver">
          <input type="checkbox" checked={inStock} onChange={(e) => update({ in_stock: e.target.checked ? '1' : null })}
                 className="h-4 w-4 accent-violet" />
          In stock only
        </label>
      </fieldset>
    </div>
  )
}

function PriceRange({ minPrice, maxPrice, onApply }: {
  minPrice: string; maxPrice: string; onApply: (lo: string, hi: string) => void
}) {
  const [lo, setLo] = useState(minPrice)
  const [hi, setHi] = useState(maxPrice)
  return (
    <form onSubmit={(e) => { e.preventDefault(); onApply(lo, hi) }} className="flex items-center gap-2">
      <input type="number" min={0} inputMode="numeric" value={lo} onChange={(e) => setLo(e.target.value)}
             aria-label="Minimum price" placeholder="Min"
             className="w-full rounded-lg border border-line bg-obsidian px-3 py-2 text-sm text-cloud outline-none focus:border-violet/60" />
      <span className="text-silver">–</span>
      <input type="number" min={0} inputMode="numeric" value={hi} onChange={(e) => setHi(e.target.value)}
             aria-label="Maximum price" placeholder="Max"
             className="w-full rounded-lg border border-line bg-obsidian px-3 py-2 text-sm text-cloud outline-none focus:border-violet/60" />
      <button type="submit" className="rounded-lg border border-line px-3 py-2 text-sm text-cloud hover:bg-white/5">Go</button>
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
