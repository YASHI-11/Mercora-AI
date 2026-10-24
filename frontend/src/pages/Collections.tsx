import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useCategories } from '../hooks/useCatalog'
import ProductImage from '../components/ProductImage'
import { ErrorState } from '../components/StateViews'

/** Every collection is a category from the database, shown with its best seller. */
export default function Collections() {
  const { data, isLoading, error } = useCategories()
  const taxonomy = [...(data?.taxonomy ?? [])].sort((a, b) => b.count - a.count)

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
      <p className="eyebrow">Collections</p>
      <h1 className="display-section mt-4 font-semibold text-cloud">Explore the Catalogue.</h1>
      <p className="mt-4 max-w-xl text-silver">
        {data ? `${taxonomy.length} collections, ${taxonomy.reduce((n, c) => n + c.count, 0).toLocaleString('en-IN')} products.` : 'Loading…'}
      </p>

      {error && <ErrorState message={(error as Error).message} />}
      <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[4/5] animate-pulse rounded-3xl border border-line bg-graphite" aria-hidden />
        ))}
        {taxonomy.map((c) => (
          <article key={c.category} className="group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-3xl border border-line bg-graphite p-6">
            <ProductImage src={c.image} name={c.top_product || c.category} category={c.category}
                          className="absolute inset-0 -z-10 h-full w-full transition-transform duration-700 group-hover:scale-[1.05]" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-obsidian via-obsidian/60 to-transparent" />
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-lavender">{c.count} products</span>
            <h2 className="mt-2 text-3xl font-semibold text-cloud">
              <Link to={`/shop?category=${encodeURIComponent(c.category)}`} className="after:absolute after:inset-0">
                {c.category}
              </Link>
            </h2>
            <ul className="relative mt-4 flex flex-wrap gap-1.5">
              {c.subcategories.map((s) => (
                <li key={s}>
                  <Link to={`/shop?category=${encodeURIComponent(c.category)}&subcategory=${encodeURIComponent(s)}`}
                        className="relative z-10 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-cloud backdrop-blur hover:bg-white/20">
                    {s}
                  </Link>
                </li>
              ))}
            </ul>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-cloud">
              Explore collection <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </article>
        ))}
      </div>
    </div>
  )
}
