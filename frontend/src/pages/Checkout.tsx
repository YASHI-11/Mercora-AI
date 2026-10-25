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
        theme: { color: '#2457d6' },
      })
      rzp.on('payment.failed', () => { setStatus('failed'); setErrorMsg('Payment failed or was declined.') })
      rzp.open()
    } catch (e) {
      setStatus('failed')
      setErrorMsg((e as Error).message)
    }
  }

  // Checkout is deliberately calm: no 3D, no decorative motion (spec §7.3).
  const stepIndex = status === 'success' ? 2 : status === 'processing' ? 1 : 0

  if (status === 'success') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Steps current={stepIndex} />
        <CheckCircle2 size={44} className="mx-auto mb-4 text-good" aria-hidden />
        <h1 className="text-3xl font-semibold text-cloud">Payment confirmed</h1>
        <p className="mt-2 text-sm text-silver">Your payment was verified on our server and the order is confirmed.</p>
        <div className="mt-8 flex justify-center gap-3">
          <button onClick={() => navigate('/orders')} className="rounded-full bg-cloud px-6 py-3 text-sm font-semibold text-obsidian hover:bg-cloud-strong">View orders</button>
          <button onClick={() => navigate('/shop')} className="rounded-full border border-line px-6 py-3 text-sm font-semibold text-cloud hover:bg-tint/5">Continue shopping</button>
        </div>
        {orderId && (
          <Link to={`/orders/${orderId}/invoice`} className="mt-5 inline-flex items-center gap-1.5 text-sm text-lavender hover:text-cloud">
            <FileText size={14} /> View invoice
          </Link>
        )}
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <XCircle size={44} className="mx-auto mb-4 text-bad" aria-hidden />
        <h1 className="text-3xl font-semibold text-cloud">Payment not completed</h1>
        <p className="mt-2 text-sm text-silver">{errorMsg || 'Something went wrong during payment.'} You have not been charged for an unverified payment.</p>
        <button onClick={() => setStatus('idle')} className="mt-8 rounded-full bg-cloud px-6 py-3 text-sm font-semibold text-obsidian hover:bg-cloud-strong">Try again</button>
      </div>
    )
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-silver">Your cart is empty.</p>
        <button onClick={() => navigate('/shop')} className="mt-5 rounded-full bg-cloud px-6 py-3 text-sm font-semibold text-obsidian hover:bg-cloud-strong">Go to shop</button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-10 sm:px-6">
      <Steps current={stepIndex} />
      <h1 className="text-3xl font-semibold text-cloud">Checkout</h1>
      <p className="mt-2 text-sm text-silver">Razorpay Test Mode — no real money is charged. Delivery details come from your verified account.</p>

      <section aria-labelledby="summary-title" className="mt-8 rounded-3xl border border-line bg-graphite p-6">
        <h2 id="summary-title" className="text-sm font-semibold uppercase tracking-wider text-silver">What you're buying</h2>
        <ul className="mt-4 divide-y divide-line">
          {cart.items.map((i) => (
            <li key={i.product_id} className="flex justify-between gap-4 py-3 text-sm">
              <span className="text-cloud">{i.name} <span className="text-silver">× {i.quantity}</span></span>
              <span className="shrink-0 text-cloud">₹{i.line_total.toLocaleString('en-IN')}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between text-silver"><dt>Delivery</dt><dd className="text-cloud">No charge</dd></div>
          <div className="flex justify-between text-base font-semibold text-cloud"><dt>Total payable</dt><dd>₹{cart.total.toLocaleString('en-IN')}</dd></div>
        </dl>

        <button onClick={startPayment} disabled={status === 'processing'}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-cloud py-3.5 text-sm font-semibold text-obsidian hover:bg-cloud-strong disabled:opacity-60">
          {status === 'processing' ? <><Loader2 size={15} className="animate-spin" /> Processing…</> : `Pay ₹${cart.total.toLocaleString('en-IN')} with Razorpay`}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-silver">
          <ShieldCheck size={13} className="text-good" aria-hidden /> Payment is verified on our server before your order is confirmed.
        </p>
      </section>
      <p className="mt-6 text-sm text-silver">After payment you'll get an order confirmation and an invoice under <Link to="/orders" className="text-lavender hover:text-cloud">Orders</Link>.</p>
    </div>
  )
}

const STEPS = ['Review order', 'Pay securely', 'Confirmation']

function Steps({ current }: { current: number }) {
  return (
    <ol className="mb-10 flex flex-wrap items-center gap-2 text-xs" aria-label="Checkout progress">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === current ? 'step' : undefined}
            className={`flex items-center gap-2 ${i <= current ? 'text-cloud' : 'text-silver'}`}>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] ${
            i < current ? 'bg-good-fill text-white' : i === current ? 'bg-cloud text-obsidian' : 'border border-line'
          }`}>{i + 1}</span>
          {s}
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-line" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}
