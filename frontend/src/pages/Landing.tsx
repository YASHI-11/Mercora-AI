import { Link } from 'react-router-dom'
import { ArrowRight, Search, Sparkles, ShoppingCart, LineChart, TrendingUp } from 'lucide-react'

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
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-20 pb-16 text-center">
        <span className="inline-block rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500 mb-6">
          Razorpay AI Builder — Agentic Commerce
        </span>
        <h1 className="text-4xl sm:text-5xl font-semibold text-zinc-900 tracking-tight leading-tight">
          Shop smarter.<br />Grow faster.
        </h1>
        <p className="mt-5 max-w-xl mx-auto text-zinc-500 text-base leading-relaxed">
          An AI-powered commerce platform that turns customer intent into purchases,
          and merchant data into growth.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/shop" className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700">
            Try AI Shopping
          </Link>
          <Link to="/merchant" className="rounded-md border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Merchant Dashboard
          </Link>
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-white py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-zinc-400 mb-10">
            The closed-loop AI commerce cycle
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
            {steps.map((s, i) => (
              <div key={s.label} className="flex flex-col items-center text-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                  <s.icon size={17} />
                </div>
                <span className="text-xs font-semibold text-zinc-900">{i + 1}. {s.label}</span>
                <span className="text-[11px] text-zinc-400 leading-snug">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <Sparkles size={18} className="text-zinc-700 mb-3" />
          <h3 className="text-base font-semibold text-zinc-900 mb-1.5">Customer Shopping Agent</h3>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Understands intent, searches the catalog, ranks and explains recommendations,
            and performs contextual upsell/cross-sell — before you ever check out.
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <TrendingUp size={18} className="text-zinc-700 mb-3" />
          <h3 className="text-base font-semibold text-zinc-900 mb-1.5">Merchant Growth Agent</h3>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Mines real order data for association rules and segments, proposes bundles and
            upsells with evidence, and only acts after merchant approval.
          </p>
        </div>
      </section>
    </div>
  )
}
