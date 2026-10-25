import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import {
  Kind, MAX_PHASE, PHASE, createFragments, formation, interpolate, movingBox, newFormation,
  type Context, type Fragment,
} from './fragments'
import { story } from './storyState'

// The homepage's single canvas: the navy backdrop, the intro's explosion and
// every scroll formation after it, drawn from ONE persistent fragment set.
// The intro drives it imperatively (landing/seam/burst); after that, the
// scroll director's `story.target` drives it. One rAF loop; no React state.

type Seg = [number, number, number, number]

export interface FieldHandle {
  /** Thin flattened ring and a few specks where the package lands. */
  landing: (x: number, y: number) => void
  /** Tiny particles escaping from the package seams. */
  seam: (x: number, y: number) => void
  /** The explosion: creates the persistent fragments from the package's
   * outline (viewport px) plus a brief flash, streaks and waves. */
  burst: (origin: { x: number; y: number }, edges: Seg[]) => void
  /** Skip / repeat visit / reduced motion: fragments already at rest. */
  restInstant: (origin: { x: number; y: number }, edges: Seg[]) => void
  /** Replay: forget the fragments and transient effects. */
  reset: () => void
}

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; g: number }
interface Streak { x: number; y: number; angle: number; len: number; life: number; max: number; delay: number }
interface Wave { x: number; y: number; r: number; vr: number; life: number; max: number; delay: number; squash: number; width: number }
interface Flash { x: number; y: number; r: number; life: number; max: number }

// Homepage background. StoryScenes' scrims blend into it: change them together.
const NAVY = '#030a14'
const rand = (a: number, b: number) => a + Math.random() * (b - a)
// Where the backdrop's light sits for each phase (fractions of the viewport).
const GLOW: [number, number][] = [
  [0.5, 0.55], [0.5, 0.52], [0.68, 0.5], [0.5, 0.5], [0.5, 0.42], [0.29, 0.55],
  [0.71, 0.55], [0.29, 0.55], [0.5, 0.3], [0.5, 0.5], [0.5, 0.47], [0.5, 0.47],
]

function makeSprite() {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(225,240,255,0.85)')
  grad.addColorStop(1, 'rgba(185,223,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 32)
  return c
}

export default function FragmentField({ ref }: { ref?: Ref<FieldHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sim = useRef({
    frags: null as Fragment[] | null, createdW: 1, createdH: 1, burstAt: -Infinity,
    phase: 0, sparks: [] as Spark[], streaks: [] as Streak[], waves: [] as Wave[], flashes: [] as Flash[],
    A: newFormation(), B: newFormation(), cur: newFormation(),
    w: 0, h: 0, dpr: 1, raf: 0, last: 0, sprite: null as HTMLCanvasElement | null,
  })

  useImperativeHandle(ref, () => {
    const s = sim.current
    const create = (origin: { x: number; y: number }, edges: Seg[]) => {
      // restInstant can arrive from the intro's layout effect, before this
      // component's effect has measured the canvas (fixed, full viewport).
      if (!s.w || !s.h) {
        s.w = window.innerWidth
        s.h = window.innerHeight
      }
      s.frags = createFragments(origin, edges, s.w, s.h)
      s.createdW = s.w
      s.createdH = s.h
    }
    return {
      landing(x, y) {
        s.waves.push({ x, y, r: 6, vr: 260, life: 0.7, max: 0.7, delay: 0, squash: 0.22, width: 1 })
        for (let i = 0; i < 10; i++) {
          const a = Math.PI + rand(0.15, Math.PI - 0.15)
          const v = rand(40, 140)
          s.sparks.push({ x: x + rand(-20, 20), y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.35, 0.7), max: 0.7, size: rand(1.5, 3), g: 160 })
        }
      },
      seam(x, y) {
        for (let i = 0; i < 4; i++) {
          const a = rand(Math.PI * 1.05, Math.PI * 1.95)
          const v = rand(40, 150)
          s.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.6), max: 0.6, size: rand(1.2, 2.6), g: 60 })
        }
      },
      burst(origin, edges) {
        create(origin, edges)
        s.burstAt = performance.now()
        const reach = Math.min(s.w, s.h)
        s.flashes.push({ x: origin.x, y: origin.y, r: reach * 0.55, life: 0.22, max: 0.22 })
        for (let i = 0; i < 16; i++) {
          s.streaks.push({ x: origin.x, y: origin.y, angle: (i / 16) * Math.PI * 2 + rand(-0.12, 0.12),
            len: reach * rand(0.28, 0.5), life: rand(0.45, 0.7), max: 0.7, delay: rand(0, 0.06) })
        }
        ;[0, 0.12, 0.28].forEach((delay, i) => {
          s.waves.push({ x: origin.x, y: origin.y, r: 10, vr: reach * (1.4 - i * 0.3), life: 1 - i * 0.15, max: 1 - i * 0.15, delay, squash: 1, width: 1.4 - i * 0.3 })
        })
      },
      restInstant(origin, edges) {
        if (!s.frags) create(origin, edges)
        s.burstAt = -Infinity
      },
      reset() {
        s.frags = null
        s.sparks = []
        s.streaks = []
        s.waves = []
        s.flashes = []
        s.phase = 0
      },
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx2d = canvas.getContext('2d')!
    const s = sim.current
    s.sprite = makeSprite()
    s.phase = story.target

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      s.dpr = Math.min(window.devicePixelRatio || 1, 2)
      s.w = rect.width
      s.h = rect.height
      canvas.width = Math.round(rect.width * s.dpr)
      canvas.height = Math.round(rect.height * s.dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const drawBackdrop = (phase: number) => {
      const k = Math.min(Math.floor(phase), GLOW.length - 2)
      const t = phase - k
      const gx = (GLOW[k][0] + (GLOW[k + 1][0] - GLOW[k][0]) * t) * s.w
      const gy = (GLOW[k][1] + (GLOW[k + 1][1] - GLOW[k][1]) * t) * s.h
      const big = Math.max(s.w, s.h)
      ctx2d.globalCompositeOperation = 'source-over'
      ctx2d.fillStyle = NAVY
      ctx2d.fillRect(0, 0, s.w, s.h)
      const g1 = ctx2d.createRadialGradient(gx, gy, 0, gx, gy, big * 0.75)
      g1.addColorStop(0, 'rgba(8,22,42,1)')
      g1.addColorStop(1, 'rgba(3,10,20,0)')
      ctx2d.fillStyle = g1
      ctx2d.fillRect(0, 0, s.w, s.h)
      const ix = s.w - gx * 0.6, iy = s.h * 0.85 - gy * 0.3
      const g2 = ctx2d.createRadialGradient(ix, iy, 0, ix, iy, big * 0.45)
      g2.addColorStop(0, 'rgba(185,223,255,0.05)')
      g2.addColorStop(1, 'rgba(185,223,255,0)')
      ctx2d.fillStyle = g2
      ctx2d.fillRect(0, 0, s.w, s.h)
    }

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - s.last) / 1000 || 0.016)
      s.last = now
      s.phase = story.reduced ? story.target : s.phase + (story.target - s.phase) * (1 - Math.exp(-dt * 5))
      if (Math.abs(story.target - s.phase) < 0.0005) s.phase = story.target

      ctx2d.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
      drawBackdrop(s.phase)
      ctx2d.globalCompositeOperation = 'lighter'
      ctx2d.lineCap = 'round'

      // ---- transient effects (landing, seams, the burst's flash/streaks/waves)
      for (const f of s.flashes) {
        f.life -= dt
        const a = Math.max(0, f.life / f.max) ** 2
        const grad = ctx2d.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r)
        grad.addColorStop(0, `rgba(255,255,255,${0.55 * a})`)
        grad.addColorStop(1, 'rgba(185,223,255,0)')
        ctx2d.fillStyle = grad
        ctx2d.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2)
      }
      for (const w of s.waves) {
        if (w.delay > 0) { w.delay -= dt; continue }
        w.life -= dt
        w.r += w.vr * dt
        w.vr *= Math.pow(0.25, dt)
        ctx2d.strokeStyle = `rgba(185,223,255,${0.7 * Math.max(0, w.life / w.max)})`
        ctx2d.lineWidth = w.width
        ctx2d.beginPath()
        ctx2d.ellipse(w.x, w.y, w.r, w.r * w.squash, 0, 0, Math.PI * 2)
        ctx2d.stroke()
      }
      for (const st of s.streaks) {
        if (st.delay > 0) { st.delay -= dt; continue }
        st.life -= dt
        const p = 1 - Math.max(0, st.life / st.max)
        const inner = st.len * (0.15 + 0.85 * p * p)
        const outer = st.len * Math.min(1, 0.35 + p * 1.1)
        ctx2d.strokeStyle = `rgba(255,255,255,${0.75 * Math.max(0, st.life / st.max)})`
        ctx2d.lineWidth = 1
        ctx2d.beginPath()
        ctx2d.moveTo(st.x + Math.cos(st.angle) * inner, st.y + Math.sin(st.angle) * inner)
        ctx2d.lineTo(st.x + Math.cos(st.angle) * outer, st.y + Math.sin(st.angle) * outer)
        ctx2d.stroke()
      }
      for (const sp of s.sparks) {
        sp.life -= dt
        const drag = Math.pow(0.05, dt)
        sp.vx *= drag
        sp.vy = sp.vy * drag + sp.g * dt
        sp.x += sp.vx * dt
        sp.y += sp.vy * dt
        ctx2d.globalAlpha = Math.max(0, sp.life / sp.max)
        ctx2d.drawImage(s.sprite!, sp.x - sp.size, sp.y - sp.size, sp.size * 2, sp.size * 2)
      }
      ctx2d.globalAlpha = 1
      s.flashes = s.flashes.filter((p) => p.life > 0)
      s.waves = s.waves.filter((p) => p.life > 0)
      s.streaks = s.streaks.filter((p) => p.life > 0)
      s.sparks = s.sparks.filter((p) => p.life > 0)

      // ---- the persistent fragments, in the formation the phase asks for
      if (s.frags) {
        const c: Context = {
          w: s.w, h: s.h, scrollY: window.scrollY, frags: s.frags,
          sinceBurst: (now - s.burstAt) / 1000, sx: s.w / s.createdW, sy: s.h / s.createdH,
        }
        const p = Math.min(Math.max(s.phase, 0), MAX_PHASE)
        const k = Math.min(Math.floor(p), MAX_PHASE - 1)
        const t = p - k
        if (k === PHASE.box) {
          movingBox(t, c, s.cur)
        } else {
          formation(k, c, s.A)
          formation(k + 1, c, s.B)
          // Between product silhouettes the fragments spread before converging.
          const spread = k >= PHASE.world && k < PHASE.necklace ? 0.2 : 0.05
          interpolate(s.A, s.B, t, k, c, s.cur, spread)
        }

        // The AI ring: a light wave travels around it.
        const ringWeight = Math.max(0, 1 - Math.abs(p - PHASE.ring))
        const wave = now / 1000 * 1.1
        const rcx = s.w / 2, rcy = s.h * 0.5

        const { x, y, rot, len, alpha } = s.cur
        for (let i = 0; i < s.frags.length; i++) {
          const fr = s.frags[i]
          let a = alpha[i]
          if (ringWeight > 0) {
            const bump = Math.max(0, Math.cos(Math.atan2(y[i] - rcy, x[i] - rcx) - wave)) ** 10
            a = Math.min(1, a * (1 + ringWeight * bump * 1.4))
          }
          if (a <= 0.01) continue
          if (fr.kind === Kind.Dot) {
            const size = fr.size * len[i]
            ctx2d.globalAlpha = a
            ctx2d.drawImage(s.sprite!, x[i] - size, y[i] - size, size * 2, size * 2)
            continue
          }
          ctx2d.globalAlpha = 1
          ctx2d.strokeStyle = `rgba(255,255,255,${a})`
          ctx2d.lineWidth = fr.kind === Kind.Line ? 1.6 : 1.1
          ctx2d.beginPath()
          if (fr.kind === Kind.Line) {
            const hx = (Math.cos(rot[i]) * len[i]) / 2
            const hy = (Math.sin(rot[i]) * len[i]) / 2
            ctx2d.moveTo(x[i] - hx, y[i] - hy)
            ctx2d.lineTo(x[i] + hx, y[i] + hy)
          } else {
            const r = fr.size * len[i]
            for (let j = 0; j <= fr.sides; j++) {
              const ang = rot[i] + (j / fr.sides) * Math.PI * 2
              if (j === 0) ctx2d.moveTo(x[i] + Math.cos(ang) * r, y[i] + Math.sin(ang) * r)
              else ctx2d.lineTo(x[i] + Math.cos(ang) * r, y[i] + Math.sin(ang) * r)
            }
          }
          ctx2d.stroke()
        }
        ctx2d.globalAlpha = 1
      }
      s.raf = document.hidden ? 0 : requestAnimationFrame(frame)
    }
    const start = () => {
      if (!s.raf && !document.hidden) {
        s.last = performance.now()
        s.raf = requestAnimationFrame(frame)
      }
    }
    const onVisibility = () => (document.hidden ? (cancelAnimationFrame(s.raf), (s.raf = 0)) : start())
    document.addEventListener('visibilitychange', onVisibility)
    start()

    return () => {
      cancelAnimationFrame(s.raf)
      s.raf = 0
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      s.sprite = null
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />
}

