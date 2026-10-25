import { Loader2, AlertTriangle, PackageSearch } from 'lucide-react'

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-silver">
      <Loader2 size={22} className="animate-spin text-lavender" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <AlertTriangle size={22} className="text-red-400" />
      <span className="max-w-sm text-sm text-silver">{message}</span>
    </div>
  )
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <PackageSearch size={24} className="text-silver" />
      <span className="text-sm font-medium text-cloud">{title}</span>
      {subtitle && <span className="max-w-sm text-xs text-silver">{subtitle}</span>}
    </div>
  )
}
