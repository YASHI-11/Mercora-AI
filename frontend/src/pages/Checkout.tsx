import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2, ShieldCheck, FileText } from 'lucide-react'
import { api, getCustomerId } from '../lib/api'
import { useCart } from '../hooks/useCart'

declare global {
  interface Window { Razorpay: any }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

type Status = 'idle' | 'processing' | 'success' | 'failed'

export default function Checkout() {
  const { cart, invalidate } = useCart()
  const customerId = getCustomerId()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [orderId, setOrderId] = useState<string | null>(null)

  async function startPayment() {
    setStatus('processing')
    setErrorMsg('')
    try {
      const { data } = await api.post('/payments/create-order', { customer_id: customerId })
      setOrderId(data.order_id)

      if (data.mock) {
        // Razorpay not configured server-side: simulate a successful test payment deterministically.
        const paymentId = 'pay_mock_' + Math.random().toString(36).slice(2, 12)
        const { data: sig } = await api.get('/payments/mock-signature', {
          params: { order_id: data.razorpay_order_id, payment_id: paymentId },
        })
        await api.post('/payments/verify', {
          razorpay_order_id: data.razorpay_order_id, razorpay_payment_id: paymentId,
          razorpay_signature: sig.signature, order_id: data.order_id,
        })
        setStatus('success')
        invalidate()
        return
      }

      const loaded = await loadRazorpayScript()
      if (!loaded) {
        setStatus('failed')
        setErrorMsg('Failed to load Razorpay checkout script.')
        return
      }

      const rzp = new window.Razorpay({
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: 'Mercora AI',
        description: 'Order ' + data.order_id,
        order_id: data.razorpay_order_id,
        handler: async (response: any) => {
          try {
            await api.post('/payments/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              order_id: data.order_id,
            })
            setStatus('success')
            invalidate()
          } catch (e) {
            setStatus('failed')
            setErrorMsg((e as Error).message)
          }
        },
        modal: { ondismiss: () => setStatus('idle') },
        theme: { color: '#b3812f' },
      })
      rzp.on('payment.failed', () => { setStatus('failed'); setErrorMsg('Payment failed or was declined.') })
      rzp.open()
    } catch (e) {
      setStatus('failed')
      setErrorMsg((e as Error).message)
    }
  }

  if (status === 'success') {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-4" />
        <h1 className="font-display italic text-2xl text-zinc-900">Payment Successful</h1>
        <p className="text-sm text-zinc-500 mt-1">Your order has been confirmed.</p>
        <div className="flex justify-center gap-3 mt-6">
          <button onClick={() => navigate('/orders')} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">View Orders</button>
          <button onClick={() => navigate('/shop')} className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:border-zinc-300">Continue Shopping</button>
        </div>
        {orderId && (
          <Link to={`/orders/${orderId}/invoice`} className="mt-4 flex items-center justify-center gap-1.5 text-sm font-medium text-gold-600 hover:text-gold-700">
            <FileText size={14} /> View Invoice
          </Link>
        )}
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <XCircle size={40} className="mx-auto text-red-500 mb-4" />
        <h1 className="font-display italic text-2xl text-zinc-900">Payment Failed</h1>
        <p className="text-sm text-zinc-500 mt-1">{errorMsg || 'Something went wrong during payment.'}</p>
        <button onClick={() => setStatus('idle')} className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">Try Again</button>
      </div>
    )
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-sm text-zinc-500">Your cart is empty.</p>
        <button onClick={() => navigate('/shop')} className="mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">Go to Shop</button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display italic text-2xl text-zinc-900 mb-1">Checkout</h1>
      <p className="text-sm text-zinc-500 mb-6">Razorpay Test Mode — no real payment is made.</p>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="space-y-2 mb-4">
          {cart.items.map((i) => (
            <div key={i.product_id} className="flex justify-between text-sm text-zinc-600">
              <span>{i.name} × {i.quantity}</span><span>₹{i.line_total.toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-sm font-semibold text-zinc-900 border-t border-zinc-200 pt-3">
          <span>Total</span><span>₹{cart.total.toLocaleString('en-IN')}</span>
        </div>

        <button onClick={startPayment} disabled={status === 'processing'}
                className="mt-5 w-full flex items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60">
          {status === 'processing' ? <><Loader2 size={15} className="animate-spin" /> Processing…</> : 'Pay with Razorpay'}
        </button>
        <p className="flex items-center justify-center gap-1.5 mt-3 text-xs text-zinc-400">
          <ShieldCheck size={12} className="text-gold-500" /> Secured by Razorpay · Test Mode
        </p>
      </div>
    </div>
  )
}
