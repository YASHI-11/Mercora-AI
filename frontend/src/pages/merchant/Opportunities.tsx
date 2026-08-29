import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { TrendingUp, Package, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api'
import { LoadingState, EmptyState } from '../../components/StateViews'
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

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-zinc-500">AI-generated opportunities, grounded in real order data. Nothing changes without your approval.</p>
        <button onClick={refresh} disabled={refreshing}
                className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh analysis
        </button>
      </div>

      {(!data || data.opportunities.length === 0) && (
        <EmptyState title="No opportunities yet" subtitle="Run more orders through the demo or click Refresh analysis." />
      )}

      <div className="space-y-3">
        {data?.opportunities.map((opp) => (
          <div key={opp._id} className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
            <button onClick={() => setExpanded(expanded === opp._id ? null : opp._id)}
                    className="w-full flex items-center gap-4 p-4 text-left hover:bg-zinc-50">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100">
                {opp.type === 'bundle' ? <Package size={16} /> : <TrendingUp size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900">
                  <span className="uppercase text-[10px] font-semibold text-zinc-400 mr-2">{opp.type}</span>
                  {opp.product_names.join(' + ')}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5 truncate">{opp.reason}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-zinc-900">₹{opp.expected_uplift.toLocaleString('en-IN')}/mo</p>
                <p className="text-xs text-zinc-400">{Math.round(opp.score * 100)}% confidence</p>
              </div>
            </button>

            {expanded === opp._id && (
              <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
                  {opp.support != null && <Metric label="Support" value={`${(opp.support * 100).toFixed(1)}%`} />}
                  {opp.confidence != null && <Metric label="Confidence" value={`${(opp.confidence * 100).toFixed(1)}%`} />}
                  {opp.lift != null && <Metric label="Lift" value={`${opp.lift.toFixed(2)}x`} />}
                  {opp.recommended_discount != null && <Metric label="Suggested Discount" value={`${opp.recommended_discount}%`} />}
                </div>
                <p className="text-sm text-zinc-600 mb-4">{opp.reason}</p>
                <div className="flex gap-2">
                  <button onClick={() => approve(opp._id, true)}
                          className="flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-zinc-700">
                    <CheckCircle2 size={13} /> Approve
                  </button>
                  <button onClick={() => approve(opp._id, false)}
                          className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-3.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                    <XCircle size={13} /> Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white border border-zinc-200 px-3 py-2">
      <p className="text-zinc-400">{label}</p>
      <p className="text-sm font-semibold text-zinc-900 mt-0.5">{value}</p>
    </div>
  )
}
