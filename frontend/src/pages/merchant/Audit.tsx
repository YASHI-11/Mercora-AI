import { useQuery } from '@tanstack/react-query'
import { Bot, CheckCircle2, CircleDashed, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { LoadingState, EmptyState } from '../../components/StateViews'
import type { AuditLog } from '../../types'

// Status is shown with an icon and a word, never colour alone.
const STATUS: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  approved: { label: 'Approved', icon: CheckCircle2, className: 'bg-emerald-400/10 text-emerald-300' },
  rejected: { label: 'Rejected', icon: XCircle, className: 'bg-red-400/10 text-red-300' },
  'n/a': { label: 'Automatic', icon: CircleDashed, className: 'bg-white/5 text-silver' },
}

export default function Audit() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => (await api.get<{ logs: AuditLog[] }>('/audit')).data,
  })

  if (isLoading) return <LoadingState label="Loading audit trail…" />
  if (!data || data.logs.length === 0) return <EmptyState title="No AI actions logged yet" subtitle="Approve or reject a growth opportunity to see it here." />

  return (
    <ol className="relative space-y-3 before:absolute before:inset-y-2 before:left-[19px] before:w-px before:bg-line">
      {data.logs.map((log) => {
        const status = STATUS[log.approval_status] ?? STATUS['n/a']
        const when = new Date(log.created_at)
        return (
          <li key={log._id} className="relative flex items-start gap-4">
            <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-graphite text-lavender">
              <Bot size={16} aria-hidden />
            </span>
            <div className="min-w-0 flex-1 rounded-2xl border border-line bg-graphite px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-cloud">
                  <span className="font-medium">{log.agent.replace(/_/g, ' ')}</span>
                  <span className="text-silver"> · </span>{log.action.replace(/_/g, ' ')}
                </p>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${status.className}`}>
                  <status.icon size={12} aria-hidden /> {status.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-silver">{log.result}</p>
              <time dateTime={log.created_at} className="mt-1.5 block font-mono text-[10px] text-silver/80">
                {when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </time>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
