import type { Ref } from 'react'
import { INTRO } from './introConfig'

// Geometric shipping box in white strokes (viewBox 0 0 100 100): front face,
// visible top and side faces, a folded top flap seam and a strip of tape. The
// interior is transparent. Its bottom edge sits on y = 96.

const OUTLINE = [
  'M8 34 L70 34 L70 96 L8 96 Z', // front
  'M8 34 L30 12 L92 12 L70 34', // top
  'M70 96 L92 74 L92 12', // side
]

export default function PackageOutline({ flashRef, className = '' }: {
  /** A second, ice-blue outline the intro flickers during the vibration. */
  flashRef?: Ref<SVGGElement>
  className?: string
}) {
  const stroke = {
    fill: 'none', strokeWidth: 1.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
  }
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden overflow="visible">
      <g stroke={INTRO.colors.white} {...stroke}>
        {OUTLINE.map((d) => <path key={d} d={d} />)}
        {/* Folded flap seam on the top face */}
        <path d="M39 34 L61 12" opacity={0.75} />
        {/* Tape strip running down the front from the seam */}
        <path d="M35 34 L35 54 M43 34 L43 54" opacity={0.6} />
      </g>
      <g ref={flashRef} stroke={INTRO.colors.ice} {...stroke} strokeWidth={2.4} opacity={0}>
        {OUTLINE.map((d) => <path key={d} d={d} />)}
      </g>
    </svg>
  )
}
