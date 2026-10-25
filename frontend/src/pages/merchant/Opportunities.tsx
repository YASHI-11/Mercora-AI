import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { TrendingUp, Package, CheckCircle2, XCircle, RefreshCw, ChevronDown } from 'lucide-react'
import { api } from '../../lib/api'
import { LoadingState, EmptyState } from '../../components/StateViews'
import { ghostButton, primaryButton } from '../../components/merchant/theme'
import { formatINR } from '../../hooks/useCatalog'
import type { Opportunity } from '../../types'

export default function Opportunities() {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['opportunities'],
    queryFn: async () => (await api.get<{ opportunities: Opportunity[] }>('/opportunities', { params: { status: 'pending' } })).data,
  })

  async function refresh() {
    setRefreshing(true)
    try {
      await api.get('/opportunities', { params: { refresh: true } })
      queryClient.invalidateQueries({ queryKey: ['opportunities'] })
    } finally {
      setRefreshing(false)
    }
  }

  async function approve(id: string, approve: boolean) {
    await api.post(`/opportunities/${id}/approve`, { approve })
    queryClient.invalidateQueries({ queryKey: ['opportunities'] })
    queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
  }

  if (isLoading) return <LoadingState label="Loading opportunities…" />
  const list = data?.opportunities ?? []

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-silver">
          <span className="font-grotesk text-lg font-semibold text-cloud tabular-nums">{list.length}</span> pending, ranked by score
        </p>
        <button onClick={refresh} disabled={refreshing} className={ghostButton}>
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Mining orders…' : 'Refresh analysis'}
        </button>
      </div>

      {list.length === 0 && (
        <EmptyState title="No opportunities yet" subtitle="Run more orders through the demo or click Refresh analysis." />
      )}

      <div className="space-y-3">
        {list.map((opp) => {
          const open = expanded === opp._id
          const Icon = opp.type === 'bundle' ? Package : TrendingUp
          return (
            <article key={opp._id} className={`overflow-hidden rounded-2xl border bg-graphite transition-colors ${open ? 'border-lavender/30' : 'border-line hover:border-lavender/20'}`}>
              <button onClick={() => setExpanded(open ? null : opp._id)} aria-expanded={open}
                      className="flex w-full items-center gap-4 p-4 text-left sm:p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lavender/10 text-lavender">
                  <Icon size={17} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lavender">{opp.type}</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-cloud">{opp.product_names.join('  +  ')}</p>
                </div>
                <div className="hidden w-32 shrink-0 sm:block">
                  <div className="flex justify-between text-[11px] text-silver"><span>Score</span><span className="tabular-nums text-cloud">{Math.round(opp.score * 100)}</span></div>
                  <div className="mt-1 h-1 rounded-full bg-graphite-2">
                    <div className="h-full rounded-full bg-lavender" style={{ width: `${opp.score * 100}%` }} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-grotesk text-base font-semibold text-cloud tabular-nums">{formatINR(opp.expected_uplift)}</p>
                  <p className="text-[11px] text-silver">expected / month</p>
                </div>
                <ChevronDown size={16} aria-hidden className={`shrink-0 text-silver transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>

              {open && (
                <div className="border-t border-line px-4 pb-5 pt-4 sm:px-5">
                  <p className="text-sm leading-relaxed text-silver">{opp.reason}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {opp.support != null && <Metric label="Support" value={`${(opp.support * 100).toFixed(1)}%`} />}
                    {opp.confidence != null && <Metric label="Confidence" value={`${(opp.confidence * 100).toFixed(1)}%`} />}
                    {opp.lift != null && <Metric label="Lift" value={`${opp.lift.toFixed(2)}×`} />}
                    {opp.recommended_discount != null && <Metric label="Suggested discount" value={`${opp.recommended_discount}%`} />}
                  </dl>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button onClick={() => approve(opp._id, true)} className={primaryButton}>
                      <CheckCircle2 size={14} /> Approve
                    </button>
                    <button onClick={() => approve(opp._id, false)} className={ghostButton}>
                      <XCircle size={14} /> Reject
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-obsidian/60 px-3 py-2.5">
      <dt className="text-[11px] text-silver">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm text-cloud">{value}</dd>
    </div>
  )
}
