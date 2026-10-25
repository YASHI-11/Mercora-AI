import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { useWishlist } from '../hooks/useStoredIds'
import { useAddToCart, useProductsById } from '../hooks/useCatalog'
import ProductCard from '../components/ProductCard'
import type { Product } from '../types'

export default function Wishlist() {
  const wishlist = useWishlist()
  const results = useProductsById(wishlist.ids)
  const { add, pendingId } = useAddToCart()
  const products = results.map((r) => r.data).filter((p): p is Product => !!p)
  const loading = results.some((r) => r.isLoading)

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
      <p className="eyebrow">Saved for later</p>
      <h1 className="display-section mt-4 font-semibold text-cloud">Wishlist.</h1>
      <p className="mt-3 text-sm text-silver">Saved on this device.</p>

      {wishlist.ids.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <Heart size={28} className="text-silver" aria-hidden />
          <p className="text-cloud">Nothing saved yet.</p>
          <p className="text-sm text-silver">Tap the heart on any product to keep it here.</p>
          <Link to="/shop" className="mt-3 rounded-full bg-cloud px-6 py-3 text-sm font-semibold text-obsidian hover:bg-cloud-strong">Browse products</Link>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => <ProductCard key={p._id} product={p} onAdd={add} adding={pendingId === p._id} compare />)}
          {loading && <div className="aspect-[3/4] animate-pulse rounded-2xl border border-line bg-graphite" aria-hidden />}
        </div>
      )}
    </div>
  )
}
