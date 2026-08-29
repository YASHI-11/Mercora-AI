import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { LoadingState, EmptyState } from '../../components/StateViews'
import type { AuditLog } from '../../types'

const statusColor: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  'n/a': 'bg-zinc-100 text-zinc-500',
}

export default function Audit() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => (await api.get<{ logs: AuditLog[] }>('/audit')).data,
  })

  if (isLoading) return <LoadingState label="Loading audit trail…" />
  if (!data || data.logs.length === 0) return <EmptyState title="No AI actions logged yet" subtitle="Approve or reject a growth opportunity to see it here." />

  return (
    <div className="space-y-2">
      {data.logs.map((log) => (
        <div key={log._id} className="flex items-start gap-4 rounded-lg border border-zinc-200 bg-white p-3.5">
          <span className="w-20 shrink-0 text-xs font-mono text-zinc-400 pt-0.5">
            {new Date(log.created_at).toLocaleTimeString()}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-800">
              <span className="font-medium">{log.agent}</span> · {log.action.replace(/_/g, ' ')}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">{log.result}</p>
          </div>
          <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[log.approval_status] || statusColor['n/a']}`}>
            {log.approval_status}
          </span>
        </div>
      ))}
    </div>
  )
}
