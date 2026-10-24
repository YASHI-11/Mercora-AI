import type { Ref } from 'react'
import { INTRO } from './introConfig'

// Side-view delivery mini-truck in thin white outlines, facing left (it drives
// right -> left). Strokes use `vector-effect: non-scaling-stroke`, so lines
// stay hairline-crisp at any rendered size. Wheels are separate groups so the
// intro can rotate them about their own centres.

const stroke = {
  fill: 'none',
  stroke: INTRO.colors.white,
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  vectorEffect: 'non-scaling-stroke' as const,
}

function Wheel({ cx, cy, wheelRef }: { cx: number; cy: number; wheelRef?: Ref<SVGGElement> }) {
  const r = INTRO.truck.wheelRadiusUnits
  return (
    <g ref={wheelRef}>
      <circle cx={cx} cy={cy} r={r} {...stroke} />
      <circle cx={cx} cy={cy} r={r * 0.4} {...stroke} />
      {[0, 120, 240].map((deg) => {
        const a = (deg * Math.PI) / 180
        return (
          <line key={deg} x1={cx + Math.cos(a) * r * 0.4} y1={cy + Math.sin(a) * r * 0.4}
                x2={cx + Math.cos(a) * r * 0.82} y2={cy + Math.sin(a) * r * 0.82} {...stroke} />
        )
      })}
    </g>
  )
}

export default function DeliveryTruck({ wheelRefs, className = '' }: {
  wheelRefs?: [Ref<SVGGElement>, Ref<SVGGElement>]
  className?: string
}) {
  const { viewW, viewH, wheels } = INTRO.truck
  return (
    <svg viewBox={`0 0 ${viewW} ${viewH}`} className={className} aria-hidden overflow="visible">
      {/* Cabin: bumper, sloped windshield, roof, back wall */}
      <path d="M30 150 L30 96 Q30 84 40 77 L72 52 Q80 46 92 46 L132 46 L132 150" {...stroke} />
      {/* Windshield + side window */}
      <path d="M46 88 L75 62 L94 62 L94 88 Z" {...stroke} />
      <path d="M100 62 L124 62 L124 88 L100 88 Z" {...stroke} />
      {/* Door seam and handle */}
      <path d="M97 94 L97 142" {...stroke} />
      <path d="M103 102 L113 102" {...stroke} />
      {/* Headlight and bumper */}
      <path d="M30 112 L38 112" {...stroke} />
      <path d="M22 146 L34 146" {...stroke} />
      {/* Cargo compartment: body, roof rail, rear door seam */}
      <rect x={136} y={28} width={270} height={122} rx={3} {...stroke} />
      <path d="M144 38 L398 38" {...stroke} opacity={0.55} />
      <path d="M400 34 L400 144" {...stroke} opacity={0.55} />
      {/* Chassis, broken around the wheel arches */}
      <path d="M18 158 L58 158 A34 34 0 0 1 126 158 L306 158 A34 34 0 0 1 374 158 L412 158" {...stroke} />
      <Wheel cx={wheels[0].cx} cy={wheels[0].cy} wheelRef={wheelRefs?.[0]} />
      <Wheel cx={wheels[1].cx} cy={wheels[1].cy} wheelRef={wheelRefs?.[1]} />
    </svg>
  )
}
