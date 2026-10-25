import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import StoreNav from './components/store/StoreNav'
import Footer from './components/store/Footer'
import ToastRegion from './components/store/Toast'
import Auth from './pages/Auth'
import Shop from './pages/Shop'
import ProductDetail from './pages/ProductDetail'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Orders from './pages/Orders'
import InvoicePage from './pages/Invoice'
import Collections from './pages/Collections'
import Wishlist from './pages/Wishlist'
import Compare from './pages/Compare'
import Assistant from './pages/Assistant'
import MerchantLayout from './components/MerchantLayout'
import { LoadingState } from './components/StateViews'

// The merchant dashboard (recharts etc.) is split out so shoppers never
// download it (spec §12.1: keep the initial JavaScript payload small).
// The homepage carries GSAP and the 3D scene; other pages don't need them.
const Landing = lazy(() => import('./pages/Landing'))
const Overview = lazy(() => import('./pages/merchant/Overview'))
const Analytics = lazy(() => import('./pages/merchant/Analytics'))
const MerchantProducts = lazy(() => import('./pages/merchant/Products'))
const Opportunities = lazy(() => import('./pages/merchant/Opportunities'))
const Copilot = lazy(() => import('./pages/merchant/Copilot'))
const Audit = lazy(() => import('./pages/merchant/Audit'))
const Settings = lazy(() => import('./pages/merchant/Settings'))
const MlEvaluation = lazy(() => import('./pages/merchant/MlEvaluation'))

/** Scroll to top on page changes, or to the #anchor when one is given. */
function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
    } else {
      window.scrollTo({ top: 0 })
    }
  }, [pathname, hash])
  return null
}

export default function App() {
  const { pathname } = useLocation()

  // The merchant console shares the storefront's palette and type; its shell
  // (sidebar, page header) is MerchantLayout.
  if (pathname.startsWith('/merchant')) {
    return (
      <div className="storefront min-h-screen">
        <Suspense fallback={<LoadingState />}>
        <Routes>
          <Route path="/merchant" element={<MerchantLayout />}>
            <Route index element={<Overview />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="products" element={<MerchantProducts />} />
            <Route path="opportunities" element={<Opportunities />} />
            <Route path="ml-evaluation" element={<MlEvaluation />} />
            <Route path="copilot" element={<Copilot />} />
            <Route path="audit" element={<Audit />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
        </Suspense>
      </div>
    )
  }

  const isAuthPage = pathname === '/login'

  return (
    // The homepage was designed against the first palette and keeps it.
    <div className={`storefront flex min-h-screen flex-col ${pathname === '/' ? 'theme-legacy' : ''}`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-full focus:bg-cloud focus:px-4 focus:py-2 focus:text-obsidian">
        Skip to content
      </a>
      <ScrollManager />
      {!isAuthPage && <StoreNav />}
      <main id="main" className="flex-1">
        <Suspense fallback={<div className="min-h-[100svh]" />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/shop" element={<RequireAuth><Shop /></RequireAuth>} />
          <Route path="/shop/product/:id" element={<RequireAuth><ProductDetail /></RequireAuth>} />
          <Route path="/cart" element={<RequireAuth><Cart /></RequireAuth>} />
          <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
          <Route path="/orders/:id/invoice" element={<RequireAuth><InvoicePage /></RequireAuth>} />
        </Routes>
        </Suspense>
      </main>
      {!isAuthPage && <Footer />}
      <ToastRegion />
    </div>
  )
}
