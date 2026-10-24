import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, ArrowRight, Info } from 'lucide-react'
import { api, getCustomerId, getSessionId } from '../../lib/api'
import { useAddToCart } from '../../hooks/useCatalog'
import type { Product, ShoppingAgentResponse } from '../../types'
import ProductCard from '../ProductCard'

// Prompts that this catalogue (UK gift & homeware) can actually satisfy.
const SUGGESTIONS = [
  'Christmas decorations under ₹500',
  'A gift for a tea lover',
  'Silver necklace',
  'Party supplies for a kids birthday',
]

const FALLBACK_NOTICE: Record<string, string> = {
  fallback_error: 'The AI service is unavailable right now, so these come from keyword search.',
  fallback_not_configured: 'No AI provider is configured, so these come from keyword search.',
}

export default function AISearchPanel() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ reply: string; products: Product[]; notice?: string } | null>(null)
  const [error, setError] = useState('')
  const { add, pendingId } = useAddToCart()

  async function run(text: string) {
    const message = text.trim()
    if (!message || loading) return
    setQuery(message)
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post<ShoppingAgentResponse>('/agent/shop', {
        message, customer_id: getCustomerId(), session_id: getSessionId('home-discovery'),
      })
      setResult({
        reply: data.reply,
        products: data.products ?? [],
        notice: data.llm_status ? FALLBACK_NOTICE[data.llm_status] : undefined,
      })
    } catch (e) {
      setError((e as Error).message || 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    run(query)
  }

  return (
    <section id="discover" aria-labelledby="discover-title" className="scene-ai relative flex min-h-[100svh] scroll-mt-16 flex-col justify-center px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-4xl text-center">
        <p className="ai-head eyebrow">Intelligent product discovery</p>
        <h2 id="discover-title" className="ai-head display-section mt-4 font-semibold text-cloud">
          Find What You’re Looking For.<br className="hidden sm:block" />
          <span className="text-silver"> And More.</span>
        </h2>
        <p className="ai-head mx-auto mt-5 max-w-xl text-silver">
          Describe what you need. Mercora AI searches the catalogue and explains why each product fits.
        </p>

        <div className="ai-panel relative mt-10">
        <form onSubmit={submit} role="search"
              className="relative overflow-hidden rounded-3xl border border-line bg-graphite/80 p-2 text-left shadow-[0_0_80px_-30px_rgba(139,92,246,0.55)] focus-within:border-violet/60">
          {loading && (
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
              <div className="h-full w-1/2 animate-scan bg-gradient-to-r from-transparent via-cyan to-transparent" />
            </div>
          )}
          <label htmlFor="discover-input" className="sr-only">Describe what you are looking for</label>
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="ml-3 shrink-0 text-lavender" aria-hidden />
            <input id="discover-input" value={query} onChange={(e) => setQuery(e.target.value)}
                   placeholder="Find something that matches your style, needs and budget…"
                   className="min-w-0 flex-1 bg-transparent px-2 py-4 text-base text-cloud placeholder:text-silver/70 outline-none" />
            <button type="submit" disabled={loading || !query.trim()}
                    className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-cloud px-5 py-3.5 text-sm font-semibold text-obsidian hover:bg-white disabled:opacity-50">
              {loading ? 'Searching…' : 'Search'} <ArrowRight size={15} />
            </button>
          </div>
        </form>
        </div>

        <div className="ai-suggest mt-7 flex flex-wrap justify-center gap-2" aria-label="Suggested searches">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => run(s)} disabled={loading}
                    className="rounded-full border border-line px-3.5 py-2 text-xs text-silver hover:border-lavender/50 hover:text-cloud disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="mx-auto mt-12 max-w-6xl">
        {error && <p className="text-center text-sm text-red-400">{error} — try the <Link to="/shop" className="underline">full catalogue</Link>.</p>}
        {result && (
          <>
            <p className="mx-auto max-w-3xl whitespace-pre-line text-center text-sm text-silver">{result.reply.split('\n')[0]}</p>
            {result.notice && (
              <p className="mx-auto mt-3 flex max-w-xl items-center justify-center gap-1.5 text-xs text-amber-300/90">
                <Info size={13} aria-hidden /> {result.notice}
              </p>
            )}
            {result.products.length > 0 && (
              <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {result.products.slice(0, 4).map((p) => (
                  <ProductCard key={p._id} product={p} onAdd={add} adding={pendingId === p._id} />
                ))}
              </div>
            )}
            <div className="mt-8 text-center">
              <Link to="/assistant" className="inline-flex items-center gap-1.5 text-sm text-lavender hover:text-cloud">
                Continue this in the AI assistant <ArrowRight size={14} />
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
