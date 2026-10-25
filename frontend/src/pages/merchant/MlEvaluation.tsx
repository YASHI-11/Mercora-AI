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
import type { MlEvaluation, MlEvaluationResponse, RecommenderScores } from '../../types'

// Categorical slots 1-3 of the validated reference palette (light surface):
// fixed per method, never by rank. Slot 3 is under 3:1 contrast, so every
// bar carries a visible value label and the table view repeats the numbers.
const METHODS = [
  { key: 'content', label: 'Content (TF-IDF)', short: 'Content', color: '#2a78d6' },
  { key: 'rules', label: 'Co-purchase rules', short: 'Rules', color: '#eb6834' },
  { key: 'popularity_baseline', label: 'Popularity baseline', short: 'Popularity', color: '#1baf7a' },
] as const
const METRICS: { key: keyof RecommenderScores; label: (k: number) => string; help: string }[] = [
  { key: 'precision_at_k', label: (k) => `Precision@${k}`, help: 'Share of the recommended items the customer went on to buy' },
  { key: 'recall_at_k', label: (k) => `Recall@${k}`, help: 'Share of their new items that were recommended' },
  { key: 'hit_rate', label: () => 'Hit rate', help: 'Customers with at least one correct recommendation' },
  { key: 'coverage', label: () => 'Coverage', help: 'Customers the method could recommend anything to' },
]
const GRID = '#e4e4e7'
const AXIS = { fontSize: 11, fill: '#71717a' }

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
          <h1 className="text-lg font-semibold text-zinc-900">ML Evaluation</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Offline evaluation on the real order history. Each repeat customer’s last order is held out; models
            learn only from earlier orders and are scored on what the customer actually bought next.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={() => run.mutate()} disabled={run.isPending}
                  className="flex items-center gap-1.5 rounded-md bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-60">
            {run.isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {run.isPending ? 'Evaluating…' : 'Re-run evaluation'}
          </button>
          {run.isPending && report && (
            <p className="text-[11px] text-zinc-400">The last run took {report.duration_seconds.toFixed(0)}s</p>
          )}
          {runError && <p role="alert" className="text-[11px] text-red-600">{runError}</p>}
        </div>
      </header>

      {!report ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <FlaskConical size={22} className="mx-auto text-zinc-400" aria-hidden />
          <p className="mt-3 text-sm font-medium text-zinc-900">No evaluation has been run yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Use “Re-run evaluation”, or run <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">python scripts/evaluate_ml.py</code> in <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">backend/</code>.
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
      <p className="text-xs text-zinc-400">
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
        <section className="rounded-lg border border-zinc-200 bg-white p-5 lg:col-span-3" aria-labelledby="calibration">
          <h2 id="calibration" className="text-sm font-semibold text-zinc-900">Do the rules hold on unseen orders?</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Each dot is an association rule: its confidence when mined from training orders against how often it came
            true in held-out orders. Dots on the diagonal held exactly; below it, the rule over-promised.
          </p>
          {holdout ? <CalibrationChart points={holdout.points} /> : (
            <p className="py-16 text-center text-sm text-zinc-400">
              No rule’s antecedent appears in enough held-out orders to re-check it.
            </p>
          )}
          <p className="mt-2 text-xs text-zinc-400">
            {report.rules.count} rules mined with Apriori in {report.rules.mining_seconds.toFixed(1)}s
            {report.rules.lift && ` · lift ${report.rules.lift.min.toFixed(1)}–${report.rules.lift.max.toFixed(1)}× (avg ${report.rules.lift.avg.toFixed(1)}×)`}
            {holdout && ` · re-checked where the first product appears in ≥${holdout.min_baskets} held-out orders`}
          </p>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 lg:col-span-2" aria-labelledby="segments">
          <h2 id="segments" className="text-sm font-semibold text-zinc-900">Customer segments</h2>
          <p className="mt-1 text-xs text-zinc-500">
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
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600" aria-label="Methods">
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
    <section className="rounded-lg border border-zinc-200 bg-white p-5" aria-labelledby="recommenders">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="recommenders" className="text-sm font-semibold text-zinc-900">Recommenders vs. a popularity baseline</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Top {k} recommendations per customer, seeded from their last training order, scored against items they had
            never bought before. {rec.n_evaluated.toLocaleString('en-IN')} customers.
          </p>
        </div>
        <button onClick={() => setTable((t) => !t)} aria-pressed={table}
                className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
          <Table2 size={13} /> {table ? 'Show charts' : 'Show table'}
        </button>
      </div>

      {table ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="py-2 pr-4 font-medium">Method</th>
                {METRICS.map((m) => <th key={m.key} className="py-2 pr-4 text-right font-medium">{m.label(k)}</th>)}
              </tr>
            </thead>
            <tbody>
              {METHODS.map((method) => (
                <tr key={method.key} className="border-b border-zinc-100">
                  <td className="py-2 pr-4 text-zinc-900">{method.label}</td>
                  {METRICS.map((m) => (
                    <td key={m.key} className="py-2 pr-4 text-right tabular-nums text-zinc-700">{pct(rec[method.key][m.key])}</td>
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
                    <p className="text-xs font-medium text-zinc-900">{metric.label(k)}</p>
                    <p className="text-[11px] text-zinc-400">{metric.help}</p>
                  </figcaption>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={rows} margin={{ top: 22, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
                      <CartesianGrid vertical={false} stroke={GRID} />
                      <XAxis dataKey="method" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={42} tickCount={5}
                             tickFormatter={(v: number) => `${(v * 100).toFixed(decimals)}%`}
                             domain={[0, (max: number) => (max > 0 ? Math.min(1, max * 1.15) : 0.05)]} />
                      <Tooltip cursor={{ fill: '#f4f4f5' }} content={<BarTip metric={metric.label(k)} />} />
                      <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        {rows.map((r) => <Cell key={r.method} fill={r.color} />)}
                        <LabelList dataKey="value" position="top" formatter={(v) => pct(Number(v))}
                                   style={{ fontSize: 11, fill: '#3f3f46' }} />
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

type TipProps = { active?: boolean; payload?: { payload: Record<string, unknown> }[] }

function BarTip({ active, payload, metric }: TipProps & { metric: string }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as { label: string; color: string; value: number }
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="flex items-center gap-1.5 font-medium text-zinc-900">
        <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: row.color }} />{row.label}
      </p>
      <p className="mt-0.5 text-zinc-600">{metric}: <span className="tabular-nums text-zinc-900">{pct(row.value)}</span></p>
    </div>
  )
}

type Point = NonNullable<MlEvaluation['rules']['holdout']>['points'][number]

function CalibrationChart({ points }: { points: Point[] }) {
  return (
    <>
    <p className="mt-4 text-[11px] text-zinc-500">↑ Confidence in held-out orders</p>
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="train_confidence" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]}
               tickFormatter={(v: number) => `${v * 100}%`} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }}
               label={{ value: 'Confidence in training orders', position: 'insideBottom', offset: -14, fontSize: 11, fill: '#71717a' }} />
        <YAxis type="number" dataKey="holdout_confidence" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]}
               tickFormatter={(v: number) => `${v * 100}%`} tick={AXIS} tickLine={false} axisLine={false} width={44} />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#a1a1aa" strokeWidth={1}
                       label={{ value: 'held exactly', position: 'insideTopRight', fontSize: 10, fill: '#71717a' }} />
        <Tooltip cursor={false} content={<PointTip />} />
        <Scatter data={points} fill="#2a78d6" isAnimationActive={false}
                 shape={(props: { cx?: number; cy?: number }) => (
                   <circle cx={props.cx} cy={props.cy} r={4} fill="#2a78d6" fillOpacity={0.8} stroke="#ffffff" strokeWidth={2} />
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
    <div className="max-w-xs rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-zinc-900">{p.product_a} → {p.product_b}</p>
      <p className="mt-1 tabular-nums text-zinc-600">
        Training {pct(p.train_confidence)} → held-out {pct(p.holdout_confidence)}
      </p>
      <p className="tabular-nums text-zinc-500">Lift {p.lift.toFixed(2)}× · {p.holdout_baskets} held-out orders</p>
    </div>
  )
}

function SegmentTable({ segments }: { segments: MlEvaluation['segmentation']['segments'] }) {
  if (!segments.length) return <p className="py-16 text-center text-sm text-zinc-400">Not enough customers to segment.</p>
  const largest = Math.max(...segments.map((s) => s.size))
  const sorted = [...segments].sort((a, b) => b.size - a.size)
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
            <th className="py-2 pr-3 font-medium">Segment</th>
            <th className="py-2 pr-3 font-medium">Customers</th>
            <th className="py-2 pr-3 text-right font-medium">Avg spend</th>
            <th className="py-2 text-right font-medium">Orders</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.cluster_id} className="border-b border-zinc-100 align-top">
              <td className="py-2 pr-3 text-zinc-900">
                {s.name}
                <span className="block text-[11px] text-zinc-400">last order ~{Math.round(s.avg_recency_days)} days before the latest</span>
              </td>
              <td className="py-2 pr-3">
                <span className="tabular-nums text-zinc-700">{s.size.toLocaleString('en-IN')}</span>
                <span aria-hidden className="mt-1 block h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${Math.max(4, (s.size / largest) * 100)}%` }} />
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-zinc-700">₹{Math.round(s.avg_total_spent).toLocaleString('en-IN')}</td>
              <td className="py-2 text-right tabular-nums text-zinc-700">{s.avg_frequency.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RunHistory({ k, history }: { k: number; history: MlEvaluationResponse['history'] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5" aria-labelledby="history">
      <h2 id="history" className="text-sm font-semibold text-zinc-900">Run history</h2>
      <p className="mt-1 text-xs text-zinc-500">Hit rate@{k} per run, newest first, so changes to the data or models show up as movement.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
              <th className="py-2 pr-4 font-medium">Run</th>
              <th className="py-2 pr-4 font-medium">By</th>
              {METHODS.map((m) => <th key={m.key} className="py-2 pr-4 text-right font-medium">{m.short}</th>)}
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.generated_at} className="border-b border-zinc-100">
                <td className="py-2 pr-4 text-zinc-700">{new Date(h.generated_at).toLocaleString('en-IN')}</td>
                <td className="py-2 pr-4 text-zinc-500">{h.source === 'merchant_ui' ? 'Dashboard' : 'Script'}</td>
                {METHODS.map((m) => (
                  <td key={m.key} className="py-2 pr-4 text-right tabular-nums text-zinc-700">
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
