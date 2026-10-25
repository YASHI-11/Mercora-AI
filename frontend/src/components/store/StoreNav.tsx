import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Search, ShoppingBag, User, Menu, X, Heart, Package, LogOut, LogIn, Sparkles } from 'lucide-react'
import { useCart } from '../../hooks/useCart'
import { useCategories } from '../../hooks/useCatalog'
import { useWishlist } from '../../hooks/useStoredIds'
import { getCustomerName, isAuthenticated, logout } from '../../lib/api'
import SearchOverlay from './SearchOverlay'

const NAV = [
  { to: '/#discover', label: 'Discover' },
  { to: '/shop', label: 'Shop' },
  { to: '/collections', label: 'Collections' },
  { to: '/assistant', label: 'AI Assistant' },
]

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-grotesk font-semibold tracking-[0.14em] text-cloud ${className}`}>
      MERCORA<span className="text-lavender"> AI</span>
    </span>
  )
}

export default function StoreNav() {
  const { cart } = useCart()
  const itemCount = cart?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0
  const wishlist = useWishlist()
  const { data: cats } = useCategories()
  const [scrolled, setScrolled] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  // Each menu remembers the location key it was opened on, so navigating
  // anywhere closes it without a state-resetting effect.
  const [menuAt, setMenuAt] = useState<string | null>(null)
  const [accountAt, setAccountAt] = useState<string | null>(null)
  const accountRef = useRef<HTMLDivElement>(null)
  const { pathname, hash, key: locationKey } = useLocation()
  const menuOpen = menuAt === locationKey
  const accountOpen = accountAt === locationKey
  const setMenuOpen = (open: boolean | ((o: boolean) => boolean)) =>
    setMenuAt((typeof open === 'function' ? open(menuOpen) : open) ? locationKey : null)
  const setAccountOpen = (open: boolean | ((o: boolean) => boolean)) =>
    setAccountAt((typeof open === 'function' ? open(accountOpen) : open) ? locationKey : null)
  const navigate = useNavigate()
  const authed = isAuthenticated()
  const name = getCustomerName()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!accountOpen) return
    const onDown = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setAccountAt(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAccountAt(null)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [accountOpen])

  function signOut() {
    logout()
    navigate('/', { replace: true })
  }

  const linkClass = (active: boolean) =>
    `relative px-3 py-2 text-[13px] font-medium tracking-wide transition-colors ${
      active ? 'text-cloud' : 'text-silver hover:text-cloud'
    }`

  const isActive = (to: string) => (to.startsWith('/#') ? pathname === '/' && hash === to.slice(1) : pathname.startsWith(to))

  return (
    <>
      <header className={`store-nav print:hidden sticky top-0 z-50 transition-[background-color,border-color] duration-200 ${
        scrolled || menuOpen ? 'glass border-b border-line' : 'border-b border-transparent bg-transparent'
      }`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="Mercora AI home" className="shrink-0">
            <Wordmark className="text-[15px]" />
          </Link>

          <nav aria-label="Primary" className="ml-6 hidden items-center lg:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={() => linkClass(isActive(n.to))}>
                {n.label === 'AI Assistant' && <Sparkles size={12} className="mr-1 inline text-lavender" aria-hidden />}
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setSearchOpen(true)} aria-label="Search products"
                    className="flex h-10 w-10 items-center justify-center rounded-full text-silver hover:bg-tint/5 hover:text-cloud">
              <Search size={18} />
            </button>

            <div ref={accountRef} className="relative hidden sm:block">
              <button onClick={() => setAccountOpen((o) => !o)} aria-haspopup="menu" aria-expanded={accountOpen}
                      aria-label="Account" className="flex h-10 items-center gap-2 rounded-full px-3 text-silver hover:bg-tint/5 hover:text-cloud">
                <User size={18} />
                {authed && name && <span className="max-w-24 truncate text-xs">{name}</span>}
              </button>
              {accountOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-52 overflow-hidden rounded-2xl border border-line bg-graphite py-1.5 shadow-2xl shadow-shade/50">
                  {authed ? (
                    <>
                      <MenuLink to="/orders" icon={Package}>Orders</MenuLink>
                      <MenuLink to="/wishlist" icon={Heart}>Wishlist{wishlist.ids.length > 0 && ` (${wishlist.ids.length})`}</MenuLink>
                      <button role="menuitem" onClick={signOut}
                              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-silver hover:bg-tint/5 hover:text-cloud">
                        <LogOut size={15} /> Log out
                      </button>
                    </>
                  ) : (
                    <>
                      <MenuLink to="/login" icon={LogIn}>Sign in / Sign up</MenuLink>
                      <MenuLink to="/wishlist" icon={Heart}>Wishlist{wishlist.ids.length > 0 && ` (${wishlist.ids.length})`}</MenuLink>
                    </>
                  )}
                </div>
              )}
            </div>

            <Link to="/cart" aria-label={`Cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full text-silver hover:bg-tint/5 hover:text-cloud">
              <ShoppingBag size={18} />
              {itemCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet px-1 text-[10px] font-semibold text-on-accent">
                  {itemCount}
                </span>
              )}
            </Link>

            <button onClick={() => setMenuOpen((o) => !o)} aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={menuOpen} aria-controls="mobile-menu"
                    className="flex h-10 w-10 items-center justify-center rounded-full text-silver hover:bg-tint/5 hover:text-cloud lg:hidden">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div id="mobile-menu" className="max-h-[calc(100svh-4rem)] overflow-y-auto border-t border-line px-4 pb-8 pt-4 lg:hidden">
            <nav aria-label="Mobile" className="grid gap-1">
              {NAV.map((n) => (
                <Link key={n.to} to={n.to} className="rounded-xl px-3 py-3 text-base font-medium text-cloud hover:bg-tint/5">
                  {n.label}
                </Link>
              ))}
            </nav>
            {cats && cats.taxonomy.length > 0 && (
              <>
                <p className="eyebrow mt-6 mb-2 px-3">Categories</p>
                <div className="grid grid-cols-2 gap-1">
                  {cats.taxonomy.map((c) => (
                    <Link key={c.category} to={`/shop?category=${encodeURIComponent(c.category)}`}
                          className="rounded-xl px-3 py-2.5 text-sm text-silver hover:bg-tint/5 hover:text-cloud">
                      {c.category}
                    </Link>
                  ))}
                </div>
              </>
            )}
            <p className="eyebrow mt-6 mb-2 px-3">Account</p>
            <div className="grid gap-1">
              {authed ? (
                <>
                  <Link to="/orders" className="rounded-xl px-3 py-2.5 text-sm text-silver hover:bg-tint/5 hover:text-cloud">Orders</Link>
                  <Link to="/wishlist" className="rounded-xl px-3 py-2.5 text-sm text-silver hover:bg-tint/5 hover:text-cloud">Wishlist</Link>
                  <button onClick={signOut} className="rounded-xl px-3 py-2.5 text-left text-sm text-silver hover:bg-tint/5 hover:text-cloud">Log out</button>
                </>
              ) : (
                <>
                  <Link to="/login" className="rounded-xl px-3 py-2.5 text-sm text-silver hover:bg-tint/5 hover:text-cloud">Sign in / Sign up</Link>
                  <Link to="/wishlist" className="rounded-xl px-3 py-2.5 text-sm text-silver hover:bg-tint/5 hover:text-cloud">Wishlist</Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </>
  )
}

function MenuLink({ to, icon: Icon, children }: { to: string; icon: typeof User; children: ReactNode }) {
  return (
    <Link role="menuitem" to={to} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-silver hover:bg-tint/5 hover:text-cloud">
      <Icon size={15} /> {children}
    </Link>
  )
}
