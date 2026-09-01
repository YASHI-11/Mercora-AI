import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Loader2, ShieldCheck, ArrowLeft } from 'lucide-react'
import { api, setAuthenticatedCustomer } from '../lib/api'

type Mode = 'signup' | 'login'
type Step = 'details' | 'otp'

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-100'

export default function Auth() {
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as { from?: string } | null)?.from || '/shop'

  const [mode, setMode] = useState<Mode>('signup')
  const [step, setStep] = useState<Step>('details')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [devOtp, setDevOtp] = useState<string | null>(null)
  const [otp, setOtp] = useState('')

  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  function switchMode(next: Mode) {
    setMode(next)
    setStep('details')
    setError('')
    setDevOtp(null)
    setOtp('')
  }

  async function requestOtp(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { data } = await api.post('/auth/signup/request-otp', {
          name, age: Number(age), address, phone, email,
        })
        setDevOtp(data.mock ? data.otp : null)
      } else {
        const { data } = await api.post('/auth/login/request-otp', { phone })
        setDevOtp(data.mock ? data.otp : null)
      }
      setStep('otp')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const path = mode === 'signup' ? '/auth/signup/verify-otp' : '/auth/login/verify-otp'
      const { data } = await api.post(path, { phone, otp })
      setAuthenticatedCustomer(data)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-zinc-50">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2.5 text-zinc-900 mb-8">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-gold-300 text-[13px] font-display italic shadow-sm">M</span>
          <span className="font-display italic text-xl tracking-tight">Mercora AI</span>
        </Link>

        <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
          {step === 'details' && (
            <div className="flex mb-6 rounded-full bg-zinc-100 p-1">
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${mode === 'login' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}
              >
                Log In
              </button>
            </div>
          )}

          {step === 'otp' && (
            <button
              type="button"
              onClick={() => { setStep('details'); setError(''); setOtp('') }}
              className="flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 mb-5"
            >
              <ArrowLeft size={13} /> Back
            </button>
          )}

          {step === 'details' && mode === 'signup' && (
            <form onSubmit={requestOtp} className="space-y-3.5">
              <h1 className="font-display italic text-xl text-zinc-900 mb-1">Create your account</h1>
              <p className="text-xs text-zinc-500 mb-4">We'll verify your phone number with an OTP before creating your account.</p>
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={inputClass} />
              <input required type="number" min={13} max={120} value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age" className={inputClass} />
              <input required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" className={inputClass} />
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className={inputClass} />
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inputClass} />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button type="submit" disabled={loading}
                      className="w-full flex items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60">
                {loading ? <><Loader2 size={15} className="animate-spin" /> Sending OTP…</> : 'Send OTP'}
              </button>
            </form>
          )}

          {step === 'details' && mode === 'login' && (
            <form onSubmit={requestOtp} className="space-y-3.5">
              <h1 className="font-display italic text-xl text-zinc-900 mb-1">Welcome back</h1>
              <p className="text-xs text-zinc-500 mb-4">Log in with just your phone number — we'll send you an OTP.</p>
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className={inputClass} />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button type="submit" disabled={loading}
                      className="w-full flex items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60">
                {loading ? <><Loader2 size={15} className="animate-spin" /> Sending OTP…</> : 'Send OTP'}
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={verifyOtp} className="space-y-3.5">
              <h1 className="font-display italic text-xl text-zinc-900 mb-1">Verify your number</h1>
              <p className="text-xs text-zinc-500 mb-4">Enter the 6-digit code sent to {phone}.</p>
              {devOtp && (
                <p className="rounded-lg bg-gold-50 border border-gold-100 px-3 py-2 text-xs text-gold-700">
                  Demo mode (no SMS provider configured) — your OTP is <span className="font-semibold">{devOtp}</span>
                </p>
              )}
              <input required inputMode="numeric" maxLength={6} value={otp}
                     onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                     placeholder="6-digit OTP" className={`${inputClass} text-center tracking-[0.4em] text-lg`} />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button type="submit" disabled={loading || otp.length !== 6}
                      className="w-full flex items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60">
                {loading ? <><Loader2 size={15} className="animate-spin" /> Verifying…</> : 'Verify & Continue'}
              </button>
            </form>
          )}

          <p className="flex items-center justify-center gap-1.5 mt-5 text-[11px] text-zinc-400">
            <ShieldCheck size={12} className="text-gold-500" /> Your number is only used for account verification.
          </p>
        </div>
      </div>
    </div>
  )
}
