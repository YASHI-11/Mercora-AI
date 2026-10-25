import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, X, ArrowRight } from 'lucide-react'
import { useProducts, formatINR, finalPrice } from '../../hooks/useCatalog'
import ProductImage from '../ProductImage'

export default function SearchOverlay({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { data, isFetching } = useProducts({ q: debounced, limit: 6 }, debounced.length >= 2)

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 250)
    return () => window.clearTimeout(t)
  }, [q])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previous?.focus()
    }
  }, [onClose])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    onClose()
    navigate(`/shop?q=${encodeURIComponent(q.trim())}`)
  }

  const results = debounced.length >= 2 ? data?.products ?? [] : []

  return (
    <div role="dialog" aria-modal="true" aria-label="Search products"
         className="fixed inset-0 z-[70] bg-obsidian/80 backdrop-blur-md" onClick={onClose}>
      <div className="mx-auto mt-[10vh] w-full max-w-2xl px-4" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}
              className="flex items-center gap-3 rounded-2xl border border-line bg-graphite px-5 py-4 shadow-2xl shadow-shade/60 focus-within:border-violet/60">
          <Search size={20} className="shrink-0 text-silver" aria-hidden />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} type="search"
                 aria-label="Search the catalogue" placeholder="Search candles, mugs, necklaces…"
                 className="min-w-0 flex-1 bg-transparent text-lg text-cloud placeholder:text-silver/70 outline-none" />
          <button type="button" onClick={onClose} aria-label="Close search"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-silver hover:bg-tint/5 hover:text-cloud">
            <X size={18} />
          </button>
        </form>

        {debounced.length >= 2 && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-graphite shadow-2xl shadow-shade/60">
            {results.length === 0 && !isFetching && (
              <p className="px-5 py-6 text-sm text-silver">No products match “{debounced}”. Try another word, or ask the AI assistant.</p>
            )}
            {results.map((p) => (
              <Link key={p._id} to={`/shop/product/${p._id}`} onClick={onClose}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-tint/5">
                <ProductImage src={p.image} name={p.name} category={p.category} subcategory={p.subcategory}
                              compact className="h-12 w-12 shrink-0 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-cloud">{p.name}</span>
                  <span className="block truncate text-xs text-silver">{p.subcategory ?? p.category}</span>
                </span>
                <span className="text-sm font-medium text-cloud">{formatINR(finalPrice(p))}</span>
              </Link>
            ))}
            {results.length > 0 && (
              <button onClick={submit}
                      className="flex w-full items-center justify-between border-t border-line px-5 py-3.5 text-sm text-lavender hover:bg-tint/5">
                See all results for “{debounced}” <ArrowRight size={15} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
