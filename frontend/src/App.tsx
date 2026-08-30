import { Routes, Route, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import Landing from './pages/Landing'
import Shop from './pages/Shop'
import ProductDetail from './pages/ProductDetail'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Orders from './pages/Orders'
import MerchantLayout from './components/MerchantLayout'
import Overview from './pages/merchant/Overview'
import Analytics from './pages/merchant/Analytics'
import MerchantProducts from './pages/merchant/Products'
import Opportunities from './pages/merchant/Opportunities'
import Copilot from './pages/merchant/Copilot'
import Audit from './pages/merchant/Audit'
import Settings from './pages/merchant/Settings'

export default function App() {
  const { pathname } = useLocation()
  const isLanding = pathname === '/'

  return (
    <div className="min-h-screen bg-zinc-50">
      {!isLanding && <Navbar />}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/shop/product/:id" element={<ProductDetail />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/merchant" element={<MerchantLayout />}>
          <Route index element={<Overview />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="products" element={<MerchantProducts />} />
          <Route path="opportunities" element={<Opportunities />} />
          <Route path="copilot" element={<Copilot />} />
          <Route path="audit" element={<Audit />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </div>
  )
}
