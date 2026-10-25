import type { ReactNode } from 'react'

// Layout pieces of the merchant console; constants live in ./theme.


export function Panel({ title, subtitle, action, children, className = '', id }: {
  title?: string
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  const headingId = id ? `${id}-title` : undefined
  return (
    <section aria-labelledby={headingId} className={`rounded-2xl border border-line bg-graphite p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 id={headingId} className="text-[15px] font-semibold text-cloud">{title}</h2>}
            {subtitle && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-silver">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Tooltip body for recharts `content`: a title line and label/value rows. */
export function TipCard({ title, rows, swatch }: { title: ReactNode; rows: [string, ReactNode][]; swatch?: string }) {
  return (
    <div className="max-w-xs rounded-xl border border-line bg-graphite-2/95 px-3 py-2 text-xs shadow-xl shadow-shade/40 backdrop-blur">
      <p className="flex items-center gap-1.5 font-medium text-cloud">
        {swatch && <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: swatch }} />}
        {title}
      </p>
      {rows.map(([label, value]) => (
        <p key={label} className="mt-0.5 text-silver">
          {label}: <span className="tabular-nums text-cloud">{value}</span>
        </p>
      ))}
    </div>
  )
}
