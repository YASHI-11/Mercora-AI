// Constants for the merchant console, on the storefront palette (index.css).
// Charts follow the dataviz rules: hairline solid grid, recessive axes, text
// in text tokens and never in the series colour.

export const CHART = {
  grid: '#1b3150',
  axis: { fontSize: 11, fill: '#93a7c1' },
  /** Single-series marks: the brand's ice. */
  ice: '#b9dfff',
  /** Ring separating overlapping marks: the panel surface. */
  surface: '#0c1d35',
  /** Categorical slots 1-3 of the reference palette, dark steps, validated
   * against the panel surface (#0c1d35): CVD and normal-vision separation
   * pass all-pairs, every slot >= 3:1. Fixed per entity, never by rank. */
  series: ['#3987e5', '#d95926', '#199e70'] as const,
  cursor: 'rgba(185, 223, 255, 0.06)',
}

/** Axis ticks: the short scale without decimals or spaces (₹80L, ₹3Cr). */
export function axisINR(value: number): string {
  if (value >= 1e7) return `₹${+(value / 1e7).toFixed(1)}Cr`
  if (value >= 1e5) return `₹${Math.round(value / 1e5)}L`
  if (value >= 1e3) return `₹${Math.round(value / 1e3)}K`
  return `₹${value}`
}

export type TipProps = { active?: boolean; label?: string | number; payload?: { payload: Record<string, unknown> }[] }

export const primaryButton =
  'inline-flex items-center gap-1.5 rounded-full bg-cloud px-4 py-2 text-xs font-semibold text-obsidian hover:bg-white disabled:opacity-60'
export const ghostButton =
  'inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-xs font-medium text-cloud hover:border-lavender/50 hover:bg-white/5 disabled:opacity-60'
