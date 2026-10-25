import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowUpRight, BarChart3, FlaskConical, LayoutDashboard, Package, ScrollText, ShieldCheck, Sparkles, TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { Wordmark } from './store/StoreNav'

const NAV: { to: string; label: string; icon: LucideIcon; blurb: string; end?: boolean }[] = [
  { to: '/merchant', label: 'Overview', icon: LayoutDashboard, end: true,
    blurb: 'Revenue, orders and what the AI agents are contributing.' },
  { to: '/merchant/analytics', label: 'Analytics', icon: BarChart3,
    blurb: 'Where revenue comes from: categories, products and customer segments.' },
  { to: '/merchant/products', label: 'Products', icon: Package, blurb: 'The live catalogue shoppers see.' },
  { to: '/merchant/opportunities', label: 'Growth opportunities', icon: TrendingUp,
    blurb: 'Bundles and upsells mined from real orders. Nothing changes without your approval.' },
  { to: '/merchant/ml-evaluation', label: 'ML evaluation', icon: FlaskConical,
    blurb: 'How well the models predict what customers actually buy next.' },
  { to: '/merchant/copilot', label: 'AI copilot', icon: Sparkles,
    blurb: 'Ask about your store. Every answer is grounded in your order and product data.' },
  { to: '/merchant/audit', label: 'Audit trail', icon: ScrollText, blurb: 'Every action the AI agents took, and who approved it.' },
  { to: '/merchant/settings', label: 'Guardrails', icon: ShieldCheck,
    blurb: 'Limits enforced on the server. The agents cannot exceed them, whatever they recommend.' },
]

const itemClass = ({ isActive }: { isActive: boolean }) =>
  `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
    isActive ? 'bg-graphite-2 text-cloud' : 'text-silver hover:bg-tint/[0.04] hover:text-cloud'
  }`

/** The merchant console: a sidebar shell on the storefront palette. */
export default function MerchantLayout() {
  const { pathname } = useLocation()
  const page = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to))) ?? NAV[0]

  return (
    <div className="ambient flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-obsidian/60 px-4 py-6 backdrop-blur lg:flex">
        <Link to="/" className="px-3" aria-label="Mercora AI storefront">
          <Wordmark className="text-[15px]" />
        </Link>
        <p className="eyebrow mt-2 px-3">Merchant console</p>

        <nav aria-label="Merchant" className="mt-8 space-y-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={itemClass}>
              {({ isActive }) => (
                <>
                  {/* Kraft marker on the active item: the console's one warm cue. */}
                  <span aria-hidden className={`absolute inset-y-2 left-0 w-0.5 rounded-full bg-violet transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                  <n.icon size={16} aria-hidden className={isActive ? 'text-lavender' : 'text-silver group-hover:text-cloud'} />
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <Link to="/shop" className="mt-auto flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm text-silver hover:border-lavender/40 hover:text-cloud">
          View storefront <ArrowUpRight size={15} aria-hidden />
        </Link>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Below lg the sidebar folds into a scrolling row of tabs. */}
        <nav aria-label="Merchant" className="sticky top-0 z-30 flex gap-1 overflow-x-auto border-b border-line bg-obsidian/85 px-4 py-2 backdrop-blur [scrollbar-width:none] lg:hidden">
          <Link to="/" className="mr-2 flex shrink-0 items-center"><Wordmark className="text-xs" /></Link>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
                     className={({ isActive }) => `shrink-0 rounded-full px-3 py-1.5 text-xs ${isActive ? 'bg-graphite-2 text-cloud' : 'text-silver hover:text-cloud'}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8 lg:py-10">
          <header className="mb-8">
            <h1 className="text-3xl font-semibold text-cloud sm:text-4xl">{page.label}</h1>
            <p className="mt-2 max-w-2xl text-sm text-silver">{page.blurb}</p>
          </header>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
