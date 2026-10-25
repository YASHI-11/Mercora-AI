export default function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-graphite p-5">
      <p className="text-xs text-silver">{label}</p>
      <p className="mt-2 font-grotesk text-2xl font-semibold tracking-tight text-cloud tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs leading-relaxed text-silver">{sub}</p>}
    </div>
  )
}
