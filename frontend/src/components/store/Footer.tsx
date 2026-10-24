import { Link } from 'react-router-dom'
import { Wordmark } from './StoreNav'

// Only links to pages that exist. No support/policy pages exist yet, so none
// are invented, and no payment logos or certifications are shown (spec §4
// Section 08: "Do not display unsupported security certifications").
const COLUMNS = [
  {
    title: 'Explore',
    links: [
      { to: '/shop', label: 'All products' },
      { to: '/collections', label: 'Collections' },
      { to: '/shop?sort=popular', label: 'Trending' },
      { to: '/assistant', label: 'AI assistant' },
    ],
  },
  {
    title: 'Account',
    links: [
      { to: '/login', label: 'Sign in' },
      { to: '/wishlist', label: 'Wishlist' },
      { to: '/orders', label: 'Orders & tracking' },
      { to: '/cart', label: 'Cart' },
    ],
  },
  {
    title: 'Mercora',
    links: [
      { to: '/compare', label: 'Compare products' },
      { to: '/merchant', label: 'For merchants' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="print:hidden relative z-10 border-t border-line bg-obsidian">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <Wordmark className="text-lg" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-silver">
            Shopping, reimagined. Gifts, homeware and seasonal decor, discovered with AI that only
            recommends what’s actually in stock.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="eyebrow mb-4">{col.title}</p>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l.to}><Link to={l.to} className="text-sm text-silver hover:text-cloud">{l.label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-silver/80 sm:px-6">
          <span>© {new Date().getFullYear()} Mercora AI. Prices in INR.</span>
          <span>Payments are verified server-side via Razorpay. Product photos: Wikimedia Commons contributors.</span>
        </div>
      </div>
    </footer>
  )
}
