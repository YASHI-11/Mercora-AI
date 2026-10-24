import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Loader2, ShieldCheck, ArrowLeft } from 'lucide-react'
import { api, setAuthenticatedCustomer } from '../lib/api'
import { Wordmark } from '../components/store/StoreNav'

type Mode = 'signup' | 'login'
type Step = 'details' | 'otp'

const inputClass =
  'w-full rounded-xl border border-line bg-obsidian px-4 py-3 text-sm text-cloud placeholder:text-silver/70 focus:border-violet/60 focus:outline-none focus:ring-2 focus:ring-violet/20'

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
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2.5 text-cloud mb-8">
          <Wordmark className="text-lg" />
        </Link>

        <div className="rounded-3xl border border-line bg-graphite p-7">
          {step === 'details' && (
            <div className="flex mb-6 rounded-full border border-line bg-obsidian p-1">
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-cloud text-obsidian' : 'text-silver hover:text-cloud'}`}
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${mode === 'login' ? 'bg-cloud text-obsidian' : 'text-silver hover:text-cloud'}`}
              >
                Log In
              </button>
            </div>
          )}

          {step === 'otp' && (
            <button
              type="button"
              onClick={() => { setStep('details'); setError(''); setOtp('') }}
              className="flex items-center gap-1 text-xs font-medium text-silver hover:text-cloud mb-5"
            >
              <ArrowLeft size={13} /> Back
            </button>
          )}

          {step === 'details' && mode === 'signup' && (
            <form onSubmit={requestOtp} className="space-y-3.5">
              <h1 className="text-2xl font-semibold text-cloud mb-1">Create your account</h1>
              <p className="text-xs text-silver mb-4">We'll verify your phone number with an OTP before creating your account.</p>
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={inputClass} />
              <input required type="number" min={13} max={120} value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age" className={inputClass} />
              <input required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" className={inputClass} />
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className={inputClass} />
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inputClass} />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button type="submit" disabled={loading}
                      className="w-full flex items-center justify-center gap-2 rounded-full bg-cloud py-3 text-sm font-semibold text-obsidian hover:bg-white disabled:opacity-60">
                {loading ? <><Loader2 size={15} className="animate-spin" /> Sending OTP…</> : 'Send OTP'}
              </button>
            </form>
          )}

          {step === 'details' && mode === 'login' && (
            <form onSubmit={requestOtp} className="space-y-3.5">
              <h1 className="text-2xl font-semibold text-cloud mb-1">Welcome back</h1>
              <p className="text-xs text-silver mb-4">Log in with just your phone number — we'll send you an OTP.</p>
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className={inputClass} />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button type="submit" disabled={loading}
                      className="w-full flex items-center justify-center gap-2 rounded-full bg-cloud py-3 text-sm font-semibold text-obsidian hover:bg-white disabled:opacity-60">
                {loading ? <><Loader2 size={15} className="animate-spin" /> Sending OTP…</> : 'Send OTP'}
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={verifyOtp} className="space-y-3.5">
              <h1 className="text-2xl font-semibold text-cloud mb-1">Verify your number</h1>
              <p className="text-xs text-silver mb-4">Enter the 6-digit code sent to {phone}.</p>
              {devOtp && (
                <p className="rounded-lg border border-violet/30 bg-violet/10 px-3 py-2 text-xs text-lavender">
                  Demo mode (no SMS provider configured) — your OTP is <span className="font-semibold">{devOtp}</span>
                </p>
              )}
              <input required inputMode="numeric" maxLength={6} value={otp}
                     onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                     placeholder="6-digit OTP" className={`${inputClass} text-center tracking-[0.4em] text-lg`} />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button type="submit" disabled={loading || otp.length !== 6}
                      className="w-full flex items-center justify-center gap-2 rounded-full bg-cloud py-3 text-sm font-semibold text-obsidian hover:bg-white disabled:opacity-60">
                {loading ? <><Loader2 size={15} className="animate-spin" /> Verifying…</> : 'Verify & Continue'}
              </button>
            </form>
          )}

          <p className="flex items-center justify-center gap-1.5 mt-5 text-[11px] text-silver">
            <ShieldCheck size={12} className="text-emerald-400" /> Your number is only used for account verification.
          </p>
        </div>
      </div>
    </div>
  )
}
