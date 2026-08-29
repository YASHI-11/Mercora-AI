import { Loader2, AlertTriangle, PackageSearch } from 'lucide-react'

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-zinc-400">
      <Loader2 size={22} className="animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <AlertTriangle size={22} className="text-red-500" />
      <span className="text-sm text-zinc-600 max-w-sm">{message}</span>
    </div>
  )
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <PackageSearch size={24} className="text-zinc-300" />
      <span className="text-sm font-medium text-zinc-700">{title}</span>
      {subtitle && <span className="text-xs text-zinc-400 max-w-sm">{subtitle}</span>}
    </div>
  )
}
