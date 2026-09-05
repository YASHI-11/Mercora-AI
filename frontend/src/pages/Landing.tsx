import { Link } from 'react-router-dom'
import { ArrowRight, Search, Sparkles, ShoppingCart, LineChart, TrendingUp } from 'lucide-react'
import { isAuthenticated } from '../lib/api'

const steps = [
  { icon: Search, label: 'Customer Intent', desc: 'Natural-language shopping request' },
  { icon: Sparkles, label: 'AI Discovery', desc: 'Intent parsing & catalog search' },
  { icon: ShoppingCart, label: 'Recommendation', desc: 'Ranked, explained results + cross-sell' },
  { icon: ArrowRight, label: 'Checkout', desc: 'Razorpay Test Mode payment' },
  { icon: LineChart, label: 'Merchant Intelligence', desc: 'Revenue & behavior analytics' },
  { icon: TrendingUp, label: 'Growth', desc: 'AI opportunities, approved by merchant' },
]

export default function Landing() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-24 h-96 bg-[radial-gradient(ellipse_at_top,_rgba(179,129,47,0.10),transparent_65%)]" />
        <div className="relative px-6 sm:px-8 pt-8">
          <Link to="/" className="inline-flex items-center gap-4 text-zinc-900">
            <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-ink text-gold-300 text-2xl font-display italic shadow-sm">M</span>
            <span className="font-display italic text-4xl tracking-tight">Mercora AI</span>
          </Link>
        </div>
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-12 pb-20 text-center">
          <h1 className="text-5xl sm:text-6xl text-zinc-900 tracking-tight leading-[1.08]">
            Shop smarter.<br />
            <span className="font-display italic text-gold-600">Grow faster.</span>
          </h1>
          <p className="mt-6 max-w-xl mx-auto text-zinc-500 text-base leading-relaxed">
            An AI-powered commerce platform that turns customer intent into purchases,
            and merchant data into growth.
          </p>
          <div className="mt-9 flex items-center justify-center gap-3">
            <Link to={isAuthenticated() ? '/shop' : '/login'} className="group flex items-center gap-1.5 rounded-full bg-ink px-6 py-3 text-sm font-medium text-white shadow-lg shadow-zinc-900/10 hover:shadow-xl hover:shadow-zinc-900/15 hover:-translate-y-0.5">
              Try AI Shopping
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link to="/merchant" className="rounded-full border border-zinc-200 bg-white px-6 py-3 text-sm font-medium text-zinc-700 hover:border-zinc-300 hover:-translate-y-0.5">
              Merchant Dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-zinc-200/70 bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-12">
            The closed-loop AI commerce cycle
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-x-6 gap-y-10">
            {steps.map((s, i) => (
              <div key={s.label} className="group flex flex-col items-center text-center gap-3">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gold-50 text-gold-600 ring-1 ring-gold-100 transition-colors group-hover:bg-gold-100">
                  <s.icon size={18} />
                  <span className="absolute -top-1.5 -right-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-ink text-[9px] font-semibold text-white">
                    {i + 1}
                  </span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-zinc-900">{s.label}</span>
                  <span className="block text-[11px] text-zinc-400 leading-snug mt-0.5">{s.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-20 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="group rounded-2xl border border-zinc-200 bg-white p-7 hover:border-gold-200 hover:shadow-lg hover:shadow-zinc-900/[0.03] hover:-translate-y-0.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-gold-300 mb-5">
            <Sparkles size={17} />
          </div>
          <h3 className="text-lg font-display italic text-zinc-900 mb-2">Customer Shopping Agent</h3>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Understands intent, searches the catalog, ranks and explains recommendations,
            and performs contextual upsell/cross-sell — before you ever check out.
          </p>
        </div>
        <div className="group rounded-2xl border border-zinc-200 bg-white p-7 hover:border-gold-200 hover:shadow-lg hover:shadow-zinc-900/[0.03] hover:-translate-y-0.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-gold-300 mb-5">
            <TrendingUp size={17} />
          </div>
          <h3 className="text-lg font-display italic text-zinc-900 mb-2">Merchant Growth Agent</h3>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Mines real order data for association rules and segments, proposes bundles and
            upsells with evidence, and only acts after merchant approval.
          </p>
        </div>
      </section>
    </div>
  )
}
