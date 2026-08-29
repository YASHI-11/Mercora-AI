import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { api } from '../../lib/api'
import { LoadingState } from '../../components/StateViews'
import type { GuardrailSettings } from '../../types'

export default function Settings() {
  const { data, isLoading } = useQuery({
    queryKey: ['guardrails'],
    queryFn: async () => (await api.get<GuardrailSettings>('/merchant/settings/guardrails')).data,
  })
  const [form, setForm] = useState<GuardrailSettings | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (data) setForm(data) }, [data])

  async function save() {
    if (!form) return
    await api.put('/merchant/settings/guardrails', form)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  if (isLoading || !form) return <LoadingState label="Loading settings…" />

  return (
    <div className="max-w-xl">
      <p className="text-sm text-zinc-500 mb-6">
        These guardrails are enforced server-side. The AI agents cannot exceed them regardless of what they recommend.
      </p>

      <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
        <NumberRow label="Maximum discount (%)" value={form.max_discount}
                   onChange={(v) => setForm({ ...form, max_discount: v })} />
        <NumberRow label="Maximum bundle discount (%)" value={form.max_bundle_discount}
                   onChange={(v) => setForm({ ...form, max_bundle_discount: v })} />
        <ToggleRow label="Automatic campaign creation" value={form.automatic_campaign_creation}
                   onChange={(v) => setForm({ ...form, automatic_campaign_creation: v })} />
        <ToggleRow label="Automatic price changes" value={form.automatic_price_changes}
                   onChange={(v) => setForm({ ...form, automatic_price_changes: v })} />
        <ToggleRow label="Merchant approval required" value={form.merchant_approval_required}
                   onChange={(v) => setForm({ ...form, merchant_approval_required: v })} />
      </div>

      <button onClick={save} className="mt-5 flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
        <Save size={14} /> {saved ? 'Saved ✓' : 'Save settings'}
      </button>
    </div>
  )
}

function NumberRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm text-zinc-700">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
             className="w-20 rounded-md border border-zinc-200 px-2 py-1 text-sm text-right" />
    </div>
  )
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm text-zinc-700">{label}</span>
      <button onClick={() => onChange(!value)}
              className={`relative h-5 w-9 rounded-full transition-colors ${value ? 'bg-zinc-900' : 'bg-zinc-200'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}
