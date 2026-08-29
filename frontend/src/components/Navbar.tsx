import { Link, NavLink } from 'react-router-dom'
import { ShoppingCart, Store } from 'lucide-react'
import { useCart } from '../hooks/useCart'

export default function Navbar() {
  const { cart } = useCart()
  const itemCount = cart?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium px-3 py-2 rounded-md transition-colors ${
      isActive ? 'text-zinc-900 bg-zinc-100' : 'text-zinc-500 hover:text-zinc-900'
    }`

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2 font-semibold text-zinc-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-white text-xs font-bold">SP</span>
          ShopPilot AI
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          <NavLink to="/shop" className={linkClass}>Shop</NavLink>
          <NavLink to="/orders" className={linkClass}>Orders</NavLink>
          <NavLink to="/merchant" className={linkClass} end>Merchant</NavLink>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/cart" className="relative flex items-center justify-center h-9 w-9 rounded-md border border-zinc-200 hover:bg-zinc-50">
            <ShoppingCart size={17} />
            {itemCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-900 px-1 text-[10px] font-semibold text-white">
                {itemCount}
              </span>
            )}
          </Link>
          <Link to="/merchant" className="hidden sm:flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            <Store size={15} /> Merchant
          </Link>
        </div>
      </div>
    </header>
  )
}
