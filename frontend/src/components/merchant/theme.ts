// Constants for the merchant console, on the storefront palette (index.css).
// Charts follow the dataviz rules: hairline solid grid, recessive axes, text
// in text tokens and never in the series colour.

export const CHART = {
  grid: '#e3e8ef',
  axis: { fontSize: 11, fill: '#536378' },
  /** Category names and value labels: secondary ink. */
  label: '#2b3b52',
  /** Single-series marks: the palette's cobalt. */
  accent: '#2457d6',
  /** Ring separating overlapping marks: the panel surface. */
  surface: '#ffffff',
  /** Diagonal reference lines. */
  reference: '#9aa8ba',
  /** Categorical slots 1-3 of the dataviz reference palette, light steps,
   * validated against the panel surface (#ffffff): CVD and normal-vision
   * separation pass all-pairs. Slot 3 is under 3:1, so every categorical
   * chart also carries value labels and a table view. Fixed per entity,
   * never by rank. */
  series: ['#2a78d6', '#eb6834', '#1baf7a'] as const,
  cursor: 'rgba(11, 26, 46, 0.04)',
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
  'inline-flex items-center gap-1.5 rounded-full bg-cloud px-4 py-2 text-xs font-semibold text-obsidian hover:bg-cloud-strong disabled:opacity-60'
export const ghostButton =
  'inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-xs font-medium text-cloud hover:border-lavender/50 hover:bg-tint/5 disabled:opacity-60'
