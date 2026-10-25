import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Save } from 'lucide-react'
import { api } from '../../lib/api'
import { LoadingState } from '../../components/StateViews'
import { primaryButton } from '../../components/merchant/theme'
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
    <div className="max-w-2xl space-y-6">
      <section className="rounded-2xl border border-line bg-graphite">
        <h2 className="border-b border-line px-5 py-4 text-[15px] font-semibold text-cloud">Discount limits</h2>
        <div className="divide-y divide-line">
          <NumberRow label="Maximum discount" hint="Any single product" value={form.max_discount}
                     onChange={(v) => setForm({ ...form, max_discount: v })} />
          <NumberRow label="Maximum bundle discount" hint="Applied when you approve a bundle" value={form.max_bundle_discount}
                     onChange={(v) => setForm({ ...form, max_bundle_discount: v })} />
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-graphite">
        <h2 className="border-b border-line px-5 py-4 text-[15px] font-semibold text-cloud">Autonomy</h2>
        <div className="divide-y divide-line">
          <ToggleRow label="Automatic campaign creation" value={form.automatic_campaign_creation}
                     onChange={(v) => setForm({ ...form, automatic_campaign_creation: v })} />
          <ToggleRow label="Automatic price changes" value={form.automatic_price_changes}
                     onChange={(v) => setForm({ ...form, automatic_price_changes: v })} />
          <ToggleRow label="Merchant approval required" value={form.merchant_approval_required}
                     onChange={(v) => setForm({ ...form, merchant_approval_required: v })} />
        </div>
      </section>

      <button onClick={save} className={primaryButton}>
        {saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save guardrails</>}
      </button>
    </div>
  )
}

function NumberRow({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (v: number) => void }) {
  const id = label.toLowerCase().replace(/\W+/g, '-')
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <label htmlFor={id} className="text-sm text-cloud">
        {label}<span className="block text-xs text-silver">{hint}</span>
      </label>
      <div className="flex items-center gap-1.5 rounded-xl border border-line bg-obsidian px-3 py-1.5 focus-within:border-lavender/60">
        <input id={id} type="number" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))}
               className="w-14 bg-transparent text-right text-sm tabular-nums text-cloud outline-none" />
        <span className="text-sm text-silver">%</span>
      </div>
    </div>
  )
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <span className="text-sm text-cloud">{label}</span>
      <button role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)}
              className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-violet' : 'bg-graphite-2 ring-1 ring-inset ring-line'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full transition-transform ${value ? 'translate-x-6 bg-obsidian' : 'translate-x-1 bg-silver'}`} />
      </button>
    </div>
  )
}
