import { ChevronDown } from 'lucide-react'
import type { Explanation, ExplanationMethod } from '../types'

// What each recommender measured, in one line. The numbers themselves come
// from the explanation's signals (backend app/ml/explain.py).
const METHOD: Record<ExplanationMethod, { label: string; how: string }> = {
  co_purchase: { label: 'Bought together', how: 'Association rule mined with Apriori from paid orders.' },
  content: { label: 'Similar product', how: 'TF-IDF cosine similarity of product names, categories and tags.' },
  intent: { label: 'Search match', how: 'Text relevance to your search, blended with rating.' },
  popularity: { label: 'Popular', how: 'Ranked by rating, derived from repeat purchases.' },
}

/** "Why this?" disclosure for a recommended product: the method that picked
 * it and the numbers behind the pick. `compact` fits the assistant's rows. */
export default function WhyThis({ explanation, compact = false }: { explanation: Explanation; compact?: boolean }) {
  const method = METHOD[explanation.method]
  return (
    <details className="group/why">
      <summary className={`flex w-fit cursor-pointer list-none items-center gap-1 rounded-full border border-line font-medium text-silver hover:border-lavender/50 hover:text-cloud [&::-webkit-details-marker]:hidden ${
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
      }`}>
        Why this?
        <ChevronDown size={compact ? 10 : 12} aria-hidden className="transition-transform group-open/why:rotate-180" />
      </summary>
      <div className={`mt-2 rounded-xl border border-line bg-obsidian/70 ${compact ? 'p-2.5' : 'p-3'}`}>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-cyan">{method.label}</p>
        <p className="mt-1 text-xs leading-relaxed text-cloud">{explanation.summary}</p>
        {explanation.signals.length > 0 && (
          <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
            {explanation.signals.map((s) => (
              <div key={s.label} className={s.value.length > 14 ? 'col-span-2' : undefined}>
                <dt className="text-[10px] text-silver">{s.label}</dt>
                <dd className="font-mono text-xs text-cloud">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-2.5 border-t border-line pt-2 text-[10px] leading-relaxed text-silver">{method.how}</p>
      </div>
    </details>
  )
}
