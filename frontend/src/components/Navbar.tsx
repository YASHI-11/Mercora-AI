import { Link, NavLink, useLocation } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { useCart } from '../hooks/useCart'

export default function Navbar() {
  const { cart } = useCart()
  const itemCount = cart?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0
  const { pathname } = useLocation()
  const isMerchant = pathname.startsWith('/merchant')

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `relative text-sm font-medium px-3 py-2 transition-colors ${
      isActive ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-900'
    } after:absolute after:left-3 after:right-3 after:-bottom-[1px] after:h-[2px] after:rounded-full after:bg-gold-400 after:transition-opacity ${
      isActive ? 'after:opacity-100' : 'after:opacity-0'
    }`

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2.5 text-zinc-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-gold-300 text-[13px] font-display italic shadow-sm">M</span>
          <span className="font-display italic text-xl tracking-tight">Mercora AI</span>
        </Link>
        {!isMerchant && (
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/shop" className={linkClass}>Shop</NavLink>
            <NavLink to="/orders" className={linkClass}>Orders</NavLink>
          </nav>
        )}
        {!isMerchant && (
          <div className="flex items-center gap-2">
            <Link to="/cart" className="relative flex items-center justify-center h-9 w-9 rounded-full border border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:text-zinc-900 hover:shadow-sm">
              <ShoppingCart size={16} />
              {itemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-semibold text-white shadow-sm">
                  {itemCount}
                </span>
              )}
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
