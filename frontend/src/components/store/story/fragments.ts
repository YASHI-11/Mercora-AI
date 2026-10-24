// The homepage's fragment system, as pure geometry (no canvas, no React).
//
// A fixed set of fragments is created when the intro's package explodes. They
// never die: every later scene is a *formation* -- a target position,
// rotation, length/scale and opacity for each fragment -- and the scroll
// "phase" interpolates between consecutive formations. Phase k means
// "formation k complete"; phase k + t is the transition from k to k + 1.

export const Kind = { Dot: 0, Line: 1, Shape: 2 } as const
export type Kind = (typeof Kind)[keyof typeof Kind]

export const COUNTS = { lines: 60, dots: 120, shapes: 18 }
export const TOTAL = COUNTS.lines + COUNTS.dots + COUNTS.shapes

/** Formation indices, in scroll order. */
export const PHASE = {
  scattered: 0, box: 1, boxMoved: 2, structure: 3, world: 4,
  lantern: 5, teapot: 6, necklace: 7, frame: 8, ring: 9, finalBox: 10, opened: 11,
} as const
export const MAX_PHASE = PHASE.opened

export interface Fragment {
  kind: Kind
  /** Per-fragment random numbers (deterministic). */
  r: number[]
  /** Where the explosion launched it from, and where it came to rest (viewport px). */
  ox: number
  oy: number
  restX: number
  restY: number
  rot0: number
  restRot: number
  /** Line length at the explosion (px); dot size; shape polygon sides. */
  len0: number
  size: number
  sides: number
}

/** A formation: one entry per fragment. `len` is a line's length, or a
 * dot/shape scale factor. */
export interface Formation {
  x: Float32Array
  y: Float32Array
  rot: Float32Array
  len: Float32Array
  alpha: Float32Array
}

export const newFormation = (): Formation => ({
  x: new Float32Array(TOTAL), y: new Float32Array(TOTAL), rot: new Float32Array(TOTAL),
  len: new Float32Array(TOTAL), alpha: new Float32Array(TOTAL),
})

// -------------------------------------------------------------- utilities

export function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Lines are symmetric, so angles are compared modulo pi. */
function lerpLineAngle(a: number, b: number, t: number) {
  let d = (b - a) % Math.PI
  if (d > Math.PI / 2) d -= Math.PI
  if (d < -Math.PI / 2) d += Math.PI
  return a + d * t
}
function hash(i: number, k: number) {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}

type Seg = [number, number, number, number]
type V3 = [number, number, number]

const LINE_IDX = Array.from({ length: COUNTS.lines }, (_, i) => i)
const DOT_IDX = Array.from({ length: COUNTS.dots }, (_, i) => COUNTS.lines + i)
const SHAPE_IDX = Array.from({ length: COUNTS.shapes }, (_, i) => COUNTS.lines + COUNTS.dots + i)

/** Spread the line fragments over segments (proportionally to length) as
 * contiguous pieces, so a complete formation reads as continuous outlines. */
function placeLines(f: Formation, segs: Seg[], alpha: number, fill = 1) {
  const lens = segs.map(([a, b, c, d]) => Math.hypot(c - a, d - b))
  const total = lens.reduce((s, l) => s + l, 0) || 1
  const n = LINE_IDX.length
  // Largest-remainder allocation: every segment gets one piece when there are
  // enough to go round, the rest go by length, and the total is always n.
  // (Outlines can have more segments than there are line fragments.)
  const base = segs.length <= n ? 1 : 0
  const quotas = lens.map((l) => ((n - base * segs.length) * l) / total)
  const pieces = quotas.map((q) => base + Math.floor(q))
  const order = quotas.map((q, i) => [q - Math.floor(q), i]).sort((a, b) => b[0] - a[0])
  for (let r = n - pieces.reduce((s, p) => s + p, 0), j = 0; r > 0; r--, j++) pieces[order[j % order.length][1]]++
  let li = 0
  segs.forEach(([x1, y1, x2, y2], s) => {
    const p = pieces[s]
    const ang = Math.atan2(y2 - y1, x2 - x1)
    for (let j = 0; j < p && li < n; j++, li++) {
      const t = (j + 0.5) / p
      const idx = LINE_IDX[li]
      f.x[idx] = x1 + (x2 - x1) * t
      f.y[idx] = y1 + (y2 - y1) * t
      f.rot[idx] = ang
      f.len[idx] = (lens[s] / p) * fill
      f.alpha[idx] = alpha
    }
  })
}

/** Dots evenly along the segments (with an optional deterministic jitter). */
function placeDots(f: Formation, segs: Seg[], alpha: number, scale = 1, jitter = 0, idxs = DOT_IDX) {
  const lens = segs.map(([a, b, c, d]) => Math.hypot(c - a, d - b))
  const total = lens.reduce((s, l) => s + l, 0) || 1
  idxs.forEach((idx, j) => {
    let d = ((j + 0.5) / idxs.length) * total
    let s = 0
    while (s < segs.length - 1 && d > lens[s]) { d -= lens[s]; s++ }
    const [x1, y1, x2, y2] = segs[s]
    const t = lens[s] ? d / lens[s] : 0
    f.x[idx] = x1 + (x2 - x1) * t + (hash(idx, 7) - 0.5) * jitter
    f.y[idx] = y1 + (y2 - y1) * t + (hash(idx, 9) - 0.5) * jitter
    f.rot[idx] = 0
    f.len[idx] = scale
    f.alpha[idx] = alpha
  })
}

function placeShapes(f: Formation, pts: [number, number][], alpha: number, scale = 1) {
  SHAPE_IDX.forEach((idx, j) => {
    const [x, y] = pts[j % pts.length]
    const ring = Math.floor(j / pts.length)
    f.x[idx] = x + (ring ? (hash(idx, 3) - 0.5) * 18 : 0)
    f.y[idx] = y + (ring ? (hash(idx, 4) - 0.5) * 18 : 0)
    f.rot[idx] = hash(idx, 5) * Math.PI
    f.len[idx] = scale * (ring ? 0.6 : 1)
    f.alpha[idx] = alpha * (ring ? 0.6 : 1)
  })
}

const polySegs = (pts: [number, number][], closed = false): Seg[] => {
  const segs: Seg[] = []
  for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]])
  if (closed) segs.push([pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]])
  return segs
}
const ellipsePts = (cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = Math.PI * 2, n = 24): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]
  })

// ------------------------------------------------------------------ the box

// The package as a cube. These ten edges are exactly PackageOutline's
// strokes (front face, top face, side face, flap seam) under the oblique
// projection below, so a rebuilt box matches the intro's box line for line.
const BOX_EDGES: [V3, V3][] = [
  [[-1, 1, -1], [1, 1, -1]], [[1, 1, -1], [1, -1, -1]], [[1, -1, -1], [-1, -1, -1]], [[-1, -1, -1], [-1, 1, -1]],
  [[-1, 1, -1], [-1, 1, 1]], [[-1, 1, 1], [1, 1, 1]], [[1, 1, 1], [1, 1, -1]],
  [[1, 1, 1], [1, -1, 1]], [[1, -1, 1], [1, -1, -1]],
  [[0, 1, -1], [0, 1, 1]],
]
const BOX_VERTS: V3[] = [[-1, 1, -1], [1, 1, -1], [1, -1, -1], [-1, -1, -1], [-1, 1, 1], [1, 1, 1], [1, -1, 1]]

/** PackageOutline's own projection, in its viewBox units (0..100). */
const oblique = ([x, y, z]: V3): [number, number] => [50 + x * 31 + z * 11, 54 - y * 31 - z * 11]
function perspective([x, y, z]: V3, ry: number, rx: number): [number, number] {
  const cy = Math.cos(ry), sy = Math.sin(ry)
  const x1 = x * cy + z * sy
  const z1 = -x * sy + z * cy
  const cx = Math.cos(rx), sx = Math.sin(rx)
  const y2 = y * cx - z1 * sx
  const z2 = y * sx + z1 * cx
  const f = 4.2 / (4.2 + z2)
  return [50 + x1 * 34 * f, 54 - y2 * 34 * f]
}

/** The box, morphing from the intro's flat drawing (t=0) into a rotating,
 * perspective box that travels right (t=1). */
function boxFormation(f: Formation, cx: number, cy: number, size: number, t: number, alpha = 1) {
  const m = smoothstep(0, 0.35, t)
  const ry = t * 1.3
  const rx = -0.3 * smoothstep(0, 0.6, t)
  const project = (v: V3): [number, number] => {
    const [ox, oy] = oblique(v)
    if (m === 0) return [cx + ((ox - 50) / 100) * size, cy + ((oy - 54) / 100) * size]
    const [px, py] = perspective(v, ry, rx)
    return [cx + ((lerp(ox, px, m) - 50) / 100) * size, cy + ((lerp(oy, py, m) - 54) / 100) * size]
  }
  const segs = BOX_EDGES.map(([a, b]) => [...project(a), ...project(b)] as Seg)
  placeLines(f, segs, alpha)
  placeDots(f, segs, 0.55 * alpha, 0.8)
  placeShapes(f, BOX_VERTS.map(project), 0.8 * alpha, 0.7)
}

// --------------------------------------------------------- the structure

const PHI = (1 + Math.sqrt(5)) / 2
const ICO_VERTS: V3[] = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI],
  [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
]
const ICO_EDGES: [number, number][] = (() => {
  const edges: [number, number][] = []
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) {
    const [a, b] = [ICO_VERTS[i], ICO_VERTS[j]]
    if (Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - 2) < 0.01) edges.push([i, j])
  }
  return edges
})()

// ------------------------------------------------------------ silhouettes

// Outlines in a unit square (y down). Abstract shapes standing for real
// catalogue ranges; the page shows a genuine product from each range beside it.
const LANTERN: [number, number][][] = [
  ellipsePts(0.5, 0.06, 0.04, 0.04, 0, Math.PI * 2, 10),
  [[0.3, 0.2], [0.5, 0.1], [0.7, 0.2], [0.3, 0.2]],
  [[0.3, 0.2], [0.3, 0.8], [0.7, 0.8], [0.7, 0.2]],
  [[0.43, 0.2], [0.43, 0.8]], [[0.57, 0.2], [0.57, 0.8]],
  [[0.46, 0.72], [0.46, 0.55], [0.54, 0.55], [0.54, 0.72]],
  [[0.5, 0.42], [0.53, 0.48], [0.5, 0.53], [0.47, 0.48], [0.5, 0.42]],
  [[0.26, 0.8], [0.74, 0.8], [0.7, 0.87], [0.3, 0.87], [0.26, 0.8]],
]
const TEAPOT: [number, number][][] = [
  ellipsePts(0.5, 0.62, 0.3, 0.22, 0, Math.PI * 2, 28),
  ellipsePts(0.5, 0.42, 0.15, 0.07, Math.PI, Math.PI * 2, 10),
  [[0.35, 0.42], [0.65, 0.42]],
  ellipsePts(0.5, 0.32, 0.03, 0.03, 0, Math.PI * 2, 8),
  [[0.22, 0.56], [0.14, 0.48], [0.07, 0.36]], [[0.24, 0.68], [0.15, 0.53], [0.1, 0.39]],
  ellipsePts(0.79, 0.6, 0.1, 0.14, -Math.PI / 2, Math.PI / 2, 12),
  [[0.34, 0.85], [0.66, 0.85]],
]
const NECKLACE: [number, number][][] = [
  Array.from({ length: 21 }, (_, i) => {
    const x = 0.16 + (0.68 * i) / 20
    return [x, 0.66 - 0.58 * ((x - 0.5) / 0.34) ** 2] as [number, number]
  }),
  ellipsePts(0.5, 0.7, 0.025, 0.025, 0, Math.PI * 2, 8),
  [[0.5, 0.73], [0.57, 0.81], [0.56, 0.88], [0.5, 0.94], [0.44, 0.88], [0.43, 0.81], [0.5, 0.73]],
]
const SILHOUETTES = [LANTERN, TEAPOT, NECKLACE]

function silhouetteFormation(f: Formation, which: number, w: number, h: number) {
  const size = Math.min(h * 0.6, w * 0.36)
  const cx = which % 2 === 0 ? w * 0.29 : w * 0.71
  const cy = h * 0.53
  const map = ([u, v]: [number, number]): [number, number] => [cx + (u - 0.5) * size, cy + (v - 0.5) * size]
  const segs = SILHOUETTES[which].flatMap((poly) => polySegs(poly.map(map)))
  placeLines(f, segs, 0.95)
  placeDots(f, segs, 0.5, 0.75, 4)
  const anchors = SILHOUETTES[which].map((poly) => map(poly[0]))
  placeShapes(f, anchors, 0.7, 0.6)
}

// ----------------------------------------------------------- formations

export interface Context {
  w: number
  h: number
  scrollY: number
  frags: Fragment[]
  /** Seconds since the explosion (Infinity once settled). */
  sinceBurst: number
  /** Current viewport size / size when the fragments were created, so the
   * scattered field follows a resize. */
  sx: number
  sy: number
}

const DRAG = 0.03 // velocity multiplier per second: the explosion's deceleration

/** Write formation k into `f`. */
export function formation(k: number, ctx: Context, f: Formation) {
  const { w, h, scrollY, frags } = ctx
  const m = Math.min(w, h)
  switch (k) {
    case PHASE.scattered: {
      // Exactly where the explosion threw each fragment: o + (rest - o)(1 - DRAG^t),
      // i.e. launched outward and decelerating to rest.
      const p = 1 - DRAG ** Math.min(ctx.sinceBurst, 20)
      const fresh = 1 - smoothstep(0.2, 1.8, ctx.sinceBurst)
      frags.forEach((fr, i) => {
        f.x[i] = (fr.ox + (fr.restX - fr.ox) * p) * ctx.sx
        f.y[i] = (fr.oy + (fr.restY - fr.oy) * p) * ctx.sy
        f.rot[i] = fr.rot0 + (fr.restRot - fr.rot0) * p
        f.len[i] = fr.kind === Kind.Line ? fr.len0 : 1
        const restAlpha = fr.kind === Kind.Dot ? 0.5 : fr.kind === Kind.Line ? 0.6 : 0.45
        f.alpha[i] = restAlpha + (1 - restAlpha) * fresh
      })
      return
    }
    case PHASE.box:
      return boxFormation(f, w / 2, h * 0.52, m * 0.3, 0)
    case PHASE.boxMoved:
      return boxFormation(f, w * 0.68, h * 0.52, m * 0.33, 1)
    case PHASE.structure: {
      // A large wireframe icosahedron, turning as the page scrolls.
      const R = m * 0.17
      const ry = 0.5 + scrollY * 0.00022
      const rx = 0.42
      // Right of centre: the transformation caption sits lower left.
      const cx = w * 0.6, cy = h * 0.5
      const pts = ICO_VERTS.map((v) => {
        const [px, py] = perspective(v, ry, rx)
        return [cx + ((px - 50) / 34) * R, cy + ((py - 54) / 34) * R] as [number, number]
      })
      const segs = ICO_EDGES.map(([a, b]) => [...pts[a], ...pts[b]] as Seg)
      placeLines(f, segs, 0.9, 0.94)
      placeDots(f, segs, 0.45, 0.7)
      placeShapes(f, pts, 0.75, 0.7)
      return
    }
    case PHASE.world: {
      // Tilted orbits sweeping the viewport, turning with scroll, plus a
      // constellation of dots at several depths.
      const cx = w / 2, cy = h * 0.52
      const orbits = [
        { a: w * 0.2, b: h * 0.13, tilt: -0.22, spin: 1 },
        { a: w * 0.34, b: h * 0.22, tilt: 0.12, spin: -0.7 },
        { a: w * 0.5, b: h * 0.33, tilt: -0.06, spin: 0.45 },
      ]
      const onOrbit = (o: (typeof orbits)[number], ang: number): [number, number] => {
        const ex = Math.cos(ang) * o.a, ey = Math.sin(ang) * o.b
        return [cx + ex * Math.cos(o.tilt) - ey * Math.sin(o.tilt), cy + ex * Math.sin(o.tilt) + ey * Math.cos(o.tilt)]
      }
      const per = [16, 20, 24]
      let li = 0
      orbits.forEach((o, oi) => {
        const spin = scrollY * 0.00035 * o.spin
        for (let j = 0; j < per[oi]; j++, li++) {
          const ang = (j / per[oi]) * Math.PI * 2 + spin
          const d = (Math.PI / per[oi]) * 0.55
          const [x1, y1] = onOrbit(o, ang - d)
          const [x2, y2] = onOrbit(o, ang + d)
          const idx = LINE_IDX[li]
          f.x[idx] = (x1 + x2) / 2
          f.y[idx] = (y1 + y2) / 2
          f.rot[idx] = Math.atan2(y2 - y1, x2 - x1)
          f.len[idx] = Math.hypot(x2 - x1, y2 - y1)
          f.alpha[idx] = 0.7 - oi * 0.12
        }
      })
      DOT_IDX.forEach((idx, j) => {
        const r = frags[idx].r
        if (j % 2 === 0) {
          const o = orbits[j % 3]
          const [x, y] = onOrbit(o, r[0] * Math.PI * 2 + scrollY * 0.00035 * o.spin)
          f.x[idx] = x + (r[1] - 0.5) * 14
          f.y[idx] = y + (r[2] - 0.5) * 14
          f.len[idx] = 0.8
          f.alpha[idx] = 0.55
        } else {
          // Constellation: deeper dots are smaller, dimmer and drift slower.
          const depth = r[3]
          f.x[idx] = r[0] * w
          f.y[idx] = (((r[1] * h - scrollY * 0.05 * (0.3 + depth)) % h) + h) % h
          f.len[idx] = 0.45 + depth * 0.8
          f.alpha[idx] = 0.2 + depth * 0.5
        }
        f.rot[idx] = 0
      })
      SHAPE_IDX.forEach((idx, j) => {
        const o = orbits[j % 3]
        const [x, y] = onOrbit(o, (j / COUNTS.shapes) * Math.PI * 2 + scrollY * 0.00035 * o.spin * 1.3)
        f.x[idx] = x
        f.y[idx] = y
        f.rot[idx] = scrollY * 0.002 + j
        f.len[idx] = 0.9
        f.alpha[idx] = 0.75
      })
      return
    }
    case PHASE.lantern:
    case PHASE.teapot:
    case PHASE.necklace:
      return silhouetteFormation(f, k - PHASE.lantern, w, h)
    case PHASE.frame: {
      // Out of the way: a sparse frame hugging the viewport edges, so the shop reads cleanly.
      frags.forEach((fr, i) => {
        const [r0, r1, r2] = fr.r
        const per = 2 * (w + h)
        let d = r0 * per
        const inset = 14 + r1 * m * 0.07
        let x: number, y: number
        if (d < w) { x = d; y = inset } else if ((d -= w) < h) { x = w - inset; y = d } else if ((d -= h) < w) { x = w - d; y = h - inset } else { d -= w; x = inset; y = h - d }
        f.x[i] = x
        f.y[i] = y
        f.rot[i] = r2 * Math.PI
        f.len[i] = fr.kind === Kind.Line ? fr.len0 * 0.8 : 0.7
        f.alpha[i] = fr.kind === Kind.Line ? 0.28 : 0.25
      })
      return
    }
    case PHASE.ring: {
      // A clean elliptical ring around the AI search interface.
      const cx = w / 2, cy = h * 0.5
      const a = Math.min(w * 0.47, 580), b = Math.min(h * 0.36, 300)
      const n = COUNTS.lines
      LINE_IDX.forEach((idx, j) => {
        const ang = (j / n) * Math.PI * 2
        const d = (Math.PI / n) * 0.92
        const x1 = cx + Math.cos(ang - d) * a, y1 = cy + Math.sin(ang - d) * b
        const x2 = cx + Math.cos(ang + d) * a, y2 = cy + Math.sin(ang + d) * b
        f.x[idx] = (x1 + x2) / 2
        f.y[idx] = (y1 + y2) / 2
        f.rot[idx] = Math.atan2(y2 - y1, x2 - x1)
        f.len[idx] = Math.hypot(x2 - x1, y2 - y1)
        f.alpha[idx] = 0.9
      })
      DOT_IDX.forEach((idx, j) => {
        const ang = (j / COUNTS.dots) * Math.PI * 2
        const s = j % 2 ? 0.94 : 1.05
        f.x[idx] = cx + Math.cos(ang) * a * s
        f.y[idx] = cy + Math.sin(ang) * b * s
        f.rot[idx] = 0
        f.len[idx] = 0.7
        f.alpha[idx] = 0.45
      })
      SHAPE_IDX.forEach((idx, j) => {
        const ang = (j / COUNTS.shapes) * Math.PI * 2
        f.x[idx] = cx + Math.cos(ang) * a * 1.12
        f.y[idx] = cy + Math.sin(ang) * b * 1.12
        f.rot[idx] = ang
        f.len[idx] = 0.7
        f.alpha[idx] = 0.6
      })
      return
    }
    case PHASE.finalBox:
      return boxFormation(f, w / 2, h * 0.47, m * 0.32, 0)
    case PHASE.opened: {
      // The box's pieces drift outward and settle as a broken frame around the wordmark.
      boxFormation(f, w / 2, h * 0.47, m * 0.32, 0)
      const cx = w / 2, cy = h * 0.47
      frags.forEach((fr, i) => {
        const dx = f.x[i] - cx, dy = f.y[i] - cy
        const ang = Math.atan2(dy, dx) + (fr.r[4] - 0.5) * 0.5
        const R = m * (0.4 + fr.r[5] * 0.16)
        f.x[i] = cx + Math.cos(ang) * R * 1.35
        f.y[i] = cy + Math.sin(ang) * R * 0.8
        f.rot[i] = ang + Math.PI / 2
        f.alpha[i] = fr.kind === Kind.Line ? 0.6 : 0.35
      })
      return
    }
  }
}

/** Per-fragment interpolation from formation A to B at transition progress t:
 * staggered (small dots arrive first, larger shapes last), eased, along a
 * curved path. `spread` pushes the path outward first (fragments spread, then
 * converge), used between product silhouettes. */
export function interpolate(A: Formation, B: Formation, t: number, k: number, ctx: Context, out: Formation, spread = 0) {
  const { frags, w, h } = ctx
  const cx = w / 2, cy = h / 2
  for (let i = 0; i < TOTAL; i++) {
    const fr = frags[i]
    const delay = fr.kind === Kind.Dot ? fr.r[0] * 0.1 : fr.kind === Kind.Line ? 0.06 + fr.r[0] * 0.14 : 0.12 + fr.r[0] * 0.14
    const e = easeInOutCubic(clamp01((t - delay) / 0.74))
    const ax = A.x[i], ay = A.y[i], bx = B.x[i], by = B.y[i]
    const dx = bx - ax, dy = by - ay
    const dist = Math.hypot(dx, dy) || 1
    const bend = (hash(i, k) - 0.5) * 0.7 * dist
    let qx = (ax + bx) / 2 - (dy / dist) * bend
    let qy = (ay + by) / 2 + (dx / dist) * bend
    if (spread) {
      const ox = qx - cx, oy = qy - cy
      const ol = Math.hypot(ox, oy) || 1
      qx += (ox / ol) * spread * Math.min(w, h)
      qy += (oy / ol) * spread * Math.min(w, h)
    }
    const u = 1 - e
    out.x[i] = u * u * ax + 2 * u * e * qx + e * e * bx
    out.y[i] = u * u * ay + 2 * u * e * qy + e * e * by
    out.rot[i] = fr.kind === Kind.Line ? lerpLineAngle(A.rot[i], B.rot[i], e) : lerp(A.rot[i], B.rot[i], e)
    out.len[i] = lerp(A.len[i], B.len[i], e)
    out.alpha[i] = lerp(A.alpha[i], B.alpha[i], e)
  }
}

/** The box's motion (phase 1 -> 2) is a continuous transformation, not a hop
 * between two formations: evaluate it directly at t. */
export function movingBox(t: number, ctx: Context, out: Formation) {
  const { w, h } = ctx
  const m = Math.min(w, h)
  const e = easeInOutCubic(t)
  boxFormation(out, lerp(w / 2, w * 0.68, e), h * 0.52, m * lerp(0.3, 0.33, e), t)
}

// --------------------------------------------------------------- creation

/** Create the fragment set from the package's position and outline. Line
 * fragments are the box's own edges, broken into pieces; dots and shapes burst
 * from its centre. Rest positions spread across the viewport. */
export function createFragments(origin: { x: number; y: number }, edges: Seg[], w: number, h: number, seed = 20261024): Fragment[] {
  const rand = mulberry32(seed)
  const frags: Fragment[] = []
  const lens = edges.map(([a, b, c, d]) => Math.hypot(c - a, d - b))
  const total = lens.reduce((s, l) => s + l, 0)
  const restFor = (ox: number, oy: number, angle: number) => {
    const reach = Math.max(w, h) * (0.16 + rand() * 0.46)
    const x = ox + Math.cos(angle) * reach
    const y = oy + Math.sin(angle) * reach * 0.8
    // Keep the field on screen, reflecting anything that would leave it.
    const fold = (v: number, max: number) => {
      const lo = max * 0.04, hi = max * 0.96
      if (v < lo) return lo + (lo - v) * 0.3
      if (v > hi) return hi - (v - hi) * 0.3
      return v
    }
    return [Math.min(Math.max(fold(x, w), 4), w - 4), Math.min(Math.max(fold(y, h), 4), h - 4)]
  }
  for (let i = 0; i < TOTAL; i++) {
    const r = Array.from({ length: 8 }, () => rand())
    const kind = i < COUNTS.lines ? Kind.Line : i < COUNTS.lines + COUNTS.dots ? Kind.Dot : Kind.Shape
    let ox = origin.x, oy = origin.y, rot0 = r[2] * Math.PI, len0 = 6
    if (kind === Kind.Line) {
      // Piece i of the box outline.
      let d = ((i + 0.5) / COUNTS.lines) * total
      let s = 0
      while (s < edges.length - 1 && d > lens[s]) { d -= lens[s]; s++ }
      const [x1, y1, x2, y2] = edges[s]
      const t = lens[s] ? d / lens[s] : 0
      ox = x1 + (x2 - x1) * t
      oy = y1 + (y2 - y1) * t
      rot0 = Math.atan2(y2 - y1, x2 - x1)
      len0 = total / COUNTS.lines
    }
    const angle = kind === Kind.Line ? Math.atan2(oy - origin.y, ox - origin.x) + (r[3] - 0.5) * 0.7 : r[3] * Math.PI * 2
    const [restX, restY] = restFor(ox, oy, angle)
    frags.push({
      kind, r, ox, oy, restX, restY, rot0, restRot: rot0 + (r[4] - 0.5) * 6, len0,
      size: kind === Kind.Dot ? 1.4 + r[5] * 3.2 : 3 + r[5] * 4, sides: r[6] < 0.5 ? 3 : 4,
    })
  }
  return frags
}
