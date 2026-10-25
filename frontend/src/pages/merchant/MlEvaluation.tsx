import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { FlaskConical, Loader2, RefreshCw, Table2 } from 'lucide-react'
import { api } from '../../lib/api'
import { ErrorState, LoadingState } from '../../components/StateViews'
import StatCard from '../../components/StatCard'
import { TipCard } from '../../components/merchant/ui'
import { CHART, ghostButton, primaryButton, type TipProps } from '../../components/merchant/theme'
import type { MlEvaluation, MlEvaluationResponse, RecommenderScores } from '../../types'

// One categorical slot per method (CHART.series, validated for the panel
// surface), fixed per method, never by rank. Bars also carry value labels and
// the table view repeats the numbers, so colour is never the only channel.
const METHODS = [
  { key: 'content', label: 'Content (TF-IDF)', short: 'Content', color: CHART.series[0] },
  { key: 'rules', label: 'Co-purchase rules', short: 'Rules', color: CHART.series[1] },
  { key: 'popularity_baseline', label: 'Popularity baseline', short: 'Popularity', color: CHART.series[2] },
] as const
const METRICS: { key: keyof RecommenderScores; label: (k: number) => string; help: string }[] = [
  { key: 'precision_at_k', label: (k) => `Precision@${k}`, help: 'Share of the recommended items the customer went on to buy' },
  { key: 'recall_at_k', label: (k) => `Recall@${k}`, help: 'Share of their new items that were recommended' },
  { key: 'hit_rate', label: () => 'Hit rate', help: 'Customers with at least one correct recommendation' },
  { key: 'coverage', label: () => 'Coverage', help: 'Customers the method could recommend anything to' },
]

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

export default function MlEvaluation() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['ml-evaluation'],
    queryFn: async () => (await api.get<MlEvaluationResponse>('/merchant/ml-evaluation')).data,
  })
  const run = useMutation({
    mutationFn: async () => (await api.post<MlEvaluation>('/merchant/ml-evaluation/run')).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ml-evaluation'] }),
  })

  if (isLoading) return <LoadingState label="Loading evaluation…" />
  if (error) return <ErrorState message={`Could not load the evaluation report: ${error.message}`} />

  const report = data?.latest
  // lib/api.ts turns failures into Error(server detail), e.g. "An evaluation is already running".
  const runError = run.error && `The evaluation did not run: ${run.error.message}`

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm leading-relaxed text-silver">
            Offline evaluation on the real order history. Each repeat customer’s last order is held out; models
            learn only from earlier orders and are scored on what the customer actually bought next.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={() => run.mutate()} disabled={run.isPending}
                  className={primaryButton}>
            {run.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {run.isPending ? 'Evaluating…' : 'Re-run evaluation'}
          </button>
          {run.isPending && report && (
            <p className="text-[11px] text-silver">The last run took {report.duration_seconds.toFixed(0)}s</p>
          )}
          {runError && <p role="alert" className="text-[11px] text-red-300">{runError}</p>}
        </div>
      </header>

      {!report ? (
        <div className="rounded-2xl border border-dashed border-line bg-graphite px-6 py-14 text-center">
          <FlaskConical size={22} className="mx-auto text-silver" aria-hidden />
          <p className="mt-3 text-sm font-medium text-cloud">No evaluation has been run yet</p>
          <p className="mt-1 text-sm text-silver">
            Use “Re-run evaluation”, or run <code className="rounded bg-graphite-2 px-1.5 py-0.5 text-xs text-cloud">python scripts/evaluate_ml.py</code> in <code className="rounded bg-graphite-2 px-1.5 py-0.5 text-xs text-cloud">backend/</code>.
          </p>
        </div>
      ) : (
        <Report report={report} history={data!.history} />
      )}
    </div>
  )
}

function Report({ report, history }: { report: MlEvaluation; history: MlEvaluationResponse['history'] }) {
  const rec = report.recommendations
  const holdout = report.rules.holdout
  const seg = report.segmentation
  const lift = rec && rec.popularity_baseline.hit_rate > 0 ? rec.content.hit_rate / rec.popularity_baseline.hit_rate : null

  return (
    <>
      <p className="text-xs text-silver">
        Computed {new Date(report.generated_at).toLocaleString('en-IN')} by{' '}
        {report.source === 'merchant_ui' ? 'this dashboard' : report.source} in {report.duration_seconds.toFixed(1)}s ·{' '}
        {report.data.paid_orders.toLocaleString('en-IN')} paid orders, {report.data.products.toLocaleString('en-IN')} products,{' '}
        {report.data.customers.toLocaleString('en-IN')} customers
      </p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Held-out customers"
                  value={(rec?.n_evaluated ?? 0).toLocaleString('en-IN')}
                  sub={`of ${report.data.test_customers.toLocaleString('en-IN')} repeat customers with new items`} />
        <StatCard label={`Content hit rate@${report.k}`}
                  value={rec ? pct(rec.content.hit_rate) : '—'}
                  sub={lift ? `${lift.toFixed(1)}× the popularity baseline` : 'No baseline to compare with'} />
        <StatCard label="Rule confidence on unseen orders"
                  value={holdout ? pct(holdout.avg_holdout_confidence) : '—'}
                  sub={holdout ? `vs ${pct(holdout.avg_train_confidence)} in training, ${holdout.n_rules} rules re-checked` : `${report.rules.count} rules; too few to re-check`} />
        <StatCard label="Segmentation silhouette"
                  value={seg.silhouette_score != null ? seg.silhouette_score.toFixed(3) : '—'}
                  sub={`${seg.segments.length} KMeans segments on log-scaled RFM`} />
      </div>

      {rec && <RecommenderComparison k={report.k} rec={rec} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="rounded-2xl border border-line bg-graphite p-5 sm:p-6 lg:col-span-3" aria-labelledby="calibration">
          <h2 id="calibration" className="text-sm font-semibold text-cloud">Do the rules hold on unseen orders?</h2>
          <p className="mt-1 text-xs text-silver">
            Each dot is an association rule: its confidence when mined from training orders against how often it came
            true in held-out orders. Dots on the diagonal held exactly; below it, the rule over-promised.
          </p>
          {holdout ? <CalibrationChart points={holdout.points} /> : (
            <p className="py-16 text-center text-sm text-silver">
              No rule’s antecedent appears in enough held-out orders to re-check it.
            </p>
          )}
          <p className="mt-2 text-xs text-silver">
            {report.rules.count} rules mined with Apriori in {report.rules.mining_seconds.toFixed(1)}s
            {report.rules.lift && ` · lift ${report.rules.lift.min.toFixed(1)}–${report.rules.lift.max.toFixed(1)}× (avg ${report.rules.lift.avg.toFixed(1)}×)`}
            {holdout && ` · re-checked where the first product appears in ≥${holdout.min_baskets} held-out orders`}
          </p>
        </section>

        <section className="rounded-2xl border border-line bg-graphite p-5 sm:p-6 lg:col-span-2" aria-labelledby="segments">
          <h2 id="segments" className="text-sm font-semibold text-cloud">Customer segments</h2>
          <p className="mt-1 text-xs text-silver">
            Silhouette ranges from −1 to 1; above 0 means customers sit closer to their own segment than to the next.
          </p>
          <SegmentTable segments={seg.segments} />
        </section>
      </div>

      {history.length > 1 && <RunHistory k={report.k} history={history} />}
    </>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-silver" aria-label="Methods">
      {METHODS.map((m) => (
        <li key={m.key} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: m.color }} />
          {m.label}
        </li>
      ))}
    </ul>
  )
}

function RecommenderComparison({ k, rec }: { k: number; rec: NonNullable<MlEvaluation['recommendations']> }) {
  const [table, setTable] = useState(false)
  return (
    <section className="rounded-2xl border border-line bg-graphite p-5 sm:p-6" aria-labelledby="recommenders">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="recommenders" className="text-sm font-semibold text-cloud">Recommenders vs. a popularity baseline</h2>
          <p className="mt-1 text-xs text-silver">
            Top {k} recommendations per customer, seeded from their last training order, scored against items they had
            never bought before. {rec.n_evaluated.toLocaleString('en-IN')} customers.
          </p>
        </div>
        <button onClick={() => setTable((t) => !t)} aria-pressed={table}
                className={ghostButton}>
          <Table2 size={13} /> {table ? 'Show charts' : 'Show table'}
        </button>
      </div>

      {table ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-silver">
                <th className="py-2 pr-4 font-medium">Method</th>
                {METRICS.map((m) => <th key={m.key} className="py-2 pr-4 text-right font-medium">{m.label(k)}</th>)}
              </tr>
            </thead>
            <tbody>
              {METHODS.map((method) => (
                <tr key={method.key} className="border-b border-line/60">
                  <td className="py-2 pr-4 text-cloud">{method.label}</td>
                  {METRICS.map((m) => (
                    <td key={m.key} className="py-2 pr-4 text-right tabular-nums text-cloud">{pct(rec[method.key][m.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="mt-4"><Legend /></div>
          <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
            {METRICS.map((metric) => {
              const rows = METHODS.map((m) => ({ method: m.short, label: m.label, color: m.color, value: rec[m.key][metric.key] }))
              // Precision/recall sit in single-digit percents: whole-percent
              // ticks would repeat ("3%, 3%, 2%").
              const decimals = Math.max(...rows.map((r) => r.value)) < 0.1 ? 1 : 0
              return (
                <figure key={metric.key}>
                  <figcaption>
                    <p className="text-xs font-medium text-cloud">{metric.label(k)}</p>
                    <p className="text-[11px] text-silver">{metric.help}</p>
                  </figcaption>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={rows} margin={{ top: 22, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
                      <CartesianGrid vertical={false} stroke={CHART.grid} />
                      <XAxis dataKey="method" tick={CHART.axis} tickLine={false} axisLine={{ stroke: CHART.grid }} />
                      <YAxis tick={CHART.axis} tickLine={false} axisLine={false} width={42} tickCount={5}
                             tickFormatter={(v: number) => `${(v * 100).toFixed(decimals)}%`}
                             domain={[0, (max: number) => (max > 0 ? Math.min(1, max * 1.15) : 0.05)]} />
                      <Tooltip cursor={{ fill: CHART.cursor }} content={<BarTip metric={metric.label(k)} />} />
                      <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        {rows.map((r) => <Cell key={r.method} fill={r.color} />)}
                        <LabelList dataKey="value" position="top" formatter={(v) => pct(Number(v))}
                                   style={{ fontSize: 11, fill: '#c9d6e6' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </figure>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

function BarTip({ active, payload, metric }: TipProps & { metric: string }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as { label: string; color: string; value: number }
  return <TipCard title={row.label} swatch={row.color} rows={[[metric, pct(row.value)]]} />
}

type Point = NonNullable<MlEvaluation['rules']['holdout']>['points'][number]

function CalibrationChart({ points }: { points: Point[] }) {
  return (
    <>
    <p className="mt-4 text-[11px] text-silver">↑ Confidence in held-out orders</p>
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
        <CartesianGrid stroke={CHART.grid} />
        <XAxis type="number" dataKey="train_confidence" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]}
               tickFormatter={(v: number) => `${v * 100}%`} tick={CHART.axis} tickLine={false} axisLine={{ stroke: CHART.grid }}
               label={{ value: 'Confidence in training orders', position: 'insideBottom', offset: -14, fontSize: 11, fill: '#93a7c1' }} />
        <YAxis type="number" dataKey="holdout_confidence" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]}
               tickFormatter={(v: number) => `${v * 100}%`} tick={CHART.axis} tickLine={false} axisLine={false} width={44} />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#4d6a91" strokeWidth={1}
                       label={{ value: 'held exactly', position: 'insideTopRight', fontSize: 10, fill: '#93a7c1' }} />
        <Tooltip cursor={false} content={<PointTip />} />
        <Scatter data={points} fill={CHART.ice} isAnimationActive={false}
                 shape={(props: { cx?: number; cy?: number }) => (
                   <circle cx={props.cx} cy={props.cy} r={4} fill={CHART.ice} fillOpacity={0.85} stroke={CHART.surface} strokeWidth={2} />
                 )} />
      </ScatterChart>
    </ResponsiveContainer>
    </>
  )
}

function PointTip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as unknown as Point
  return (
    <TipCard title={`${p.product_a} → ${p.product_b}`} rows={[
      ['Training → held-out', `${pct(p.train_confidence)} → ${pct(p.holdout_confidence)}`],
      ['Lift', `${p.lift.toFixed(2)}×`],
      ['Held-out orders', String(p.holdout_baskets)],
    ]} />
  )
}

function SegmentTable({ segments }: { segments: MlEvaluation['segmentation']['segments'] }) {
  if (!segments.length) return <p className="py-16 text-center text-sm text-silver">Not enough customers to segment.</p>
  const largest = Math.max(...segments.map((s) => s.size))
  const sorted = [...segments].sort((a, b) => b.size - a.size)
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-silver">
            <th className="py-2 pr-3 font-medium">Segment</th>
            <th className="py-2 pr-3 font-medium">Customers</th>
            <th className="py-2 pr-3 text-right font-medium">Avg spend</th>
            <th className="py-2 text-right font-medium">Orders</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.cluster_id} className="border-b border-line/60 align-top">
              <td className="py-2 pr-3 text-cloud">
                {s.name}
                <span className="block text-[11px] text-silver">last order ~{Math.round(s.avg_recency_days)} days before the latest</span>
              </td>
              <td className="py-2 pr-3">
                <span className="tabular-nums text-cloud">{s.size.toLocaleString('en-IN')}</span>
                <span aria-hidden className="mt-1 block h-1.5 rounded-full bg-lavender" style={{ width: `${Math.max(4, (s.size / largest) * 100)}%` }} />
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-cloud">₹{Math.round(s.avg_total_spent).toLocaleString('en-IN')}</td>
              <td className="py-2 text-right tabular-nums text-cloud">{s.avg_frequency.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RunHistory({ k, history }: { k: number; history: MlEvaluationResponse['history'] }) {
  return (
    <section className="rounded-2xl border border-line bg-graphite p-5 sm:p-6" aria-labelledby="history">
      <h2 id="history" className="text-sm font-semibold text-cloud">Run history</h2>
      <p className="mt-1 text-xs text-silver">Hit rate@{k} per run, newest first, so changes to the data or models show up as movement.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-silver">
              <th className="py-2 pr-4 font-medium">Run</th>
              <th className="py-2 pr-4 font-medium">By</th>
              {METHODS.map((m) => <th key={m.key} className="py-2 pr-4 text-right font-medium">{m.short}</th>)}
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.generated_at} className="border-b border-line/60">
                <td className="py-2 pr-4 text-cloud">{new Date(h.generated_at).toLocaleString('en-IN')}</td>
                <td className="py-2 pr-4 text-silver">{h.source === 'merchant_ui' ? 'Dashboard' : 'Script'}</td>
                {METHODS.map((m) => (
                  <td key={m.key} className="py-2 pr-4 text-right tabular-nums text-cloud">
                    {h.recommendations ? pct(h.recommendations[m.key].hit_rate) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
