import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ArrowDown, ArrowRight, RotateCcw } from 'lucide-react'
import { useMedia } from '../../../hooks/useMedia'
import { INTRO, PACKAGE_EDGES } from './introConfig'
import DeliveryTruck from './DeliveryTruck'
import PackageOutline from './PackageOutline'
import type { FieldHandle } from '../story/FragmentField'
import BrandReveal from './BrandReveal'

gsap.registerPlugin(useGSAP)

const readSeen = () => {
  try {
    return sessionStorage.getItem(INTRO.sessionKey) === '1'
  } catch {
    return false
  }
}
const markSeen = () => {
  try {
    sessionStorage.setItem(INTRO.sessionKey, '1')
  } catch {
    // storage unavailable: the intro just plays again next time
  }
}
const setNavHidden = (hidden: boolean) => {
  if (hidden) document.documentElement.dataset.intro = 'playing'
  else delete document.documentElement.dataset.intro
}

/**
 * Homepage opening: a white-outline delivery truck drives in from the right,
 * drops a package that lands at the centre, leaves; the package vibrates,
 * bursts into light (Canvas particles) and reveals MERCORA AI.
 *
 * SVG for the line art, Canvas for the particles, one GSAP master timeline for
 * the choreography. Plays in full once per session; skippable (button / Esc);
 * reduced motion shows the brand frame immediately. Scrolling then carries the
 * brand frame away into the rest of the homepage.
 */
export default function MercoraIntro({ field, onDone }: {
  /** The homepage's persistent fragment field: the explosion creates the
   * fragments every later scene is built from. */
  field: RefObject<FieldHandle | null>
  onDone?: () => void
}) {
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const truckEl = useRef<HTMLDivElement>(null)
  const wheelA = useRef<SVGGElement>(null)
  const wheelB = useRef<SVGGElement>(null)
  const boxEl = useRef<HTMLDivElement>(null)
  const flashEl = useRef<SVGGElement>(null)
  const glowEl = useRef<HTMLDivElement>(null)
  const skipRef = useRef<() => void>(() => {})
  const onDoneRef = useRef(onDone)
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const [run, setRun] = useState(0)
  const [playing, setPlaying] = useState(() => !(reduced || readSeen()))

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])
  useEffect(() => () => setNavHidden(false), [])

  useGSAP(() => {
    const q = gsap.utils.selector(root)
    const { truck: T, layout: L } = INTRO
    const rect = stage.current!.getBoundingClientRect()
    const vw = rect.width
    const vh = rect.height

    // ---- Geometry, recomputed from the viewport for every screen size.
    const W = Math.min(L.truckWidthMax, Math.max(L.truckWidthMin, vw * L.truckWidthRatio), vw * 0.92)
    const k = W / T.viewW // px per truck unit
    const groundY = vh * L.groundRatio
    const truckTop = groundY - T.groundUnits * k
    const S = T.boxUnits * k // package size, px
    const x0 = vw + L.offscreen // truck start (just beyond the right edge)
    const x1 = -W - L.offscreen // truck end (just beyond the left edge)
    const speed = (x0 - x1) / INTRO.truckDuration
    const rideOffsetX = (T.boxRightUnits - T.boxUnits) * k
    const rideTop = truckTop + T.cargoFloorUnits * k - S * 0.96 // PackageOutline's base sits at 96%
    const cx = vw / 2
    const landLeft = cx - S / 2
    const landTop = groundY - S * 0.96
    // Released at truck speed, the package decelerates uniformly to rest
    // (power2.out has exactly that profile), travelling speed * fall / 2. Solve
    // for the release moment that leaves it centred.
    const fall = INTRO.fallDuration
    const releaseLeft = landLeft + (speed * fall) / 2
    const tRelease = (x0 - (releaseLeft - rideOffsetX)) / speed
    const tLand = tRelease + fall
    const vibStart = Math.max(INTRO.vibrateStart, tLand + 0.3)
    const vibDur = INTRO.vibrateDuration
    const tExplode = vibStart + vibDur + INTRO.explodeDelay // strictly after the vibration
    const tLogo = tExplode + INTRO.logoDelay
    const tEnd = tLogo + INTRO.settle

    gsap.set(truckEl.current, { width: W, top: truckTop })
    gsap.set(boxEl.current, { width: S, height: S })
    const G = S * 2.6
    gsap.set(glowEl.current, { width: G, height: G, left: cx - G / 2, top: landTop + S * 0.55 - G / 2, opacity: 0 })

    // ---- Animated state. GSAP tweens these plain objects; one ticker
    // callback writes them to the DOM (no React state per frame).
    const truck = { x: x0 }
    const box = { x: x0 + rideOffsetX, y: rideTop, rot: 0, scale: 1, opacity: 1 }
    const shake = { amp: 0 }
    const wheels = [wheelA.current, wheelB.current]
    const wheelR = T.wheelRadiusUnits * k

    const tl = gsap.timeline({ paused: true })
    const render = (time: number) => {
      const t = tl.time()
      const moving = t < INTRO.truckDuration
      truckEl.current!.style.transform =
        `translate3d(${truck.x}px, ${moving ? Math.sin(time * 24) * 0.6 : 0}px, 0)`
      // Wheels roll without slipping: angle = distance / radius (anticlockwise, driving left).
      const deg = -((x0 - truck.x) / wheelR) * (180 / Math.PI)
      wheels.forEach((w, i) => w?.setAttribute('transform', `rotate(${deg} ${T.wheels[i].cx} ${T.wheels[i].cy})`))
      // Until released, the package rides in the cargo bay.
      const x = t < tRelease ? truck.x + rideOffsetX : box.x
      const jx = shake.amp ? Math.sin(time * (40 + 85 * shake.amp)) * shake.amp * S * 0.05 : 0
      const jr = shake.amp ? Math.sin(time * (55 + 95 * shake.amp)) * shake.amp * 2.8 : 0
      boxEl.current!.style.transform =
        `translate3d(${x + jx}px, ${box.y}px, 0) rotate(${box.rot + jr}deg) scale(${box.scale})`
      boxEl.current!.style.opacity = String(box.opacity)
    }

    // A point on one of the package's seams, in viewport px.
    const edgesPx = PACKAGE_EDGES.map(([ax, ay, bx, by]) =>
      [landLeft + (ax / 100) * S, landTop + (ay / 100) * S, landLeft + (bx / 100) * S, landTop + (by / 100) * S] as
        [number, number, number, number])
    const seamPoint = () => {
      const [ax, ay, bx, by] = edgesPx[Math.floor(Math.random() * edgesPx.length)]
      const f = Math.random()
      return [ax + (bx - ax) * f, ay + (by - ay) * f] as const
    }

    // The field draws in viewport px; the stage may be offset (sticky, scrolled).
    const toViewport = (x: number, y: number): [number, number] => {
      const r = stage.current!.getBoundingClientRect()
      return [x + r.left, y + r.top]
    }
    const fieldArgs = (): [{ x: number; y: number }, [number, number, number, number][]] => {
      const [ox, oy] = toViewport(cx, landTop + S * 0.55)
      const [dx, dy] = toViewport(0, 0)
      return [{ x: ox, y: oy }, edgesPx.map(([a, b, c, d]) => [a + dx, b + dy, c + dx, d + dy] as [number, number, number, number])]
    }

    // ---- Phase 1: truck enters from the right and crosses at constant speed.
    tl.to(truck, { x: x1, duration: INTRO.truckDuration, ease: 'none' }, 0)

    // ---- Phase 2: the package leaves the rear of the cargo bay, hops, falls
    // under gravity with a slight tilt, and lands at the centre.
    tl.fromTo(box, { x: releaseLeft }, { x: landLeft, duration: fall, ease: 'power2.out', immediateRender: false }, tRelease)
      .fromTo(box, { y: rideTop }, { y: rideTop - S * INTRO.popHeight, duration: fall * 0.28, ease: 'power1.out', immediateRender: false }, tRelease)
      .to(box, { y: landTop, duration: fall * 0.72, ease: 'power2.in' }, tRelease + fall * 0.28)
      .to(box, { rot: INTRO.fallTilt, duration: fall * 0.65, ease: 'sine.inOut' }, tRelease)
      .to(box, { rot: 0, duration: 0.5, ease: 'back.out(3)' }, tLand)
      .fromTo(box, { scale: 0.94 }, { scale: 1, duration: 0.35, ease: 'back.out(4)', immediateRender: false }, tLand)
      .call(() => { const [lx, ly] = toViewport(cx, groundY); field.current?.landing(lx, ly) }, [], tLand)

    // ---- Phase 3: vibration builds -- faster, stronger, seam sparks, edge flashes, glow.
    tl.fromTo(shake, { amp: 0 }, { amp: 1, duration: vibDur, ease: 'power2.in' }, vibStart)
      .to(glowEl.current, { opacity: 0.85, duration: vibDur, ease: 'power2.in' }, vibStart)
    INTRO.sparkAt.forEach((f) => tl.call(() => {
      const [sx, sy] = seamPoint()
      const [vx, vy] = toViewport(sx, sy)
      field.current?.seam(vx, vy)
    }, [], vibStart + f * vibDur))
    INTRO.flashAt.forEach((f) => {
      tl.to(flashEl.current, { opacity: 0.95, duration: 0.04 }, vibStart + f * vibDur)
        .to(flashEl.current, { opacity: 0, duration: 0.14 }, vibStart + f * vibDur + 0.04)
    })

    // ---- Phase 4: the package bursts into light at its own position.
    tl.call(() => field.current?.burst(...fieldArgs()), [], tExplode)
      .set(shake, { amp: 0 }, tExplode)
      .to(box, { scale: 1.3, opacity: 0, duration: 0.14, ease: 'power2.out' }, tExplode)
      .to(glowEl.current, { opacity: 0, scale: 1.8, duration: 0.5, ease: 'power2.out' }, tExplode)
      .to(q('.intro-ground'), { opacity: 0, duration: 0.6, ease: 'power1.out' }, tExplode)

    // ---- Phase 5: MERCORA AI emerges as the particle field expands.
    tl.fromTo(q('.brand-letter'), { opacity: 0, y: 26, scale: 1.12 },
      { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'power3.out', stagger: 0.055 }, tLogo)
      .fromTo(q('.brand-line'), { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.9, ease: 'power2.inOut' }, tLogo + 0.45)
      .fromTo(q('.brand-sub'), { opacity: 0, y: 12, letterSpacing: '0.7em' },
        { opacity: 1, y: 0, letterSpacing: '0.42em', duration: 0.8, ease: 'power2.out' }, tLogo + INTRO.subtitleDelay)
      .fromTo(q('.intro-after'), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5 }, tEnd - 0.4)
      .set({}, {}, tEnd)

    const finish = () => {
      gsap.ticker.remove(render)
      setNavHidden(false)
      markSeen()
      setPlaying(false)
      onDoneRef.current?.()
    }
    tl.eventCallback('onComplete', finish)
    // Skip: jump to the final frame without firing the particle callbacks.
    const skip = () => {
      if (tl.progress() === 1) return
      tl.progress(1, true)
      field.current?.restInstant(...fieldArgs())
      render(0)
      finish()
    }
    skipRef.current = skip

    if (reduced || (readSeen() && run === 0)) {
      tl.progress(1, true)
      field.current?.restInstant(...fieldArgs())
      render(0)
      finish()
    } else {
      setNavHidden(true)
      gsap.ticker.add(render)
      tl.play(0)
    }

    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && skip()
    // A resize mid-sequence would invalidate the solved geometry: land on the brand frame.
    const onResize = () => skip()
    // Scrolling during the intro means "take me in": land on the brand frame so
    // the scroll story starts from the real, scattered fragments.
    const onScroll = () => window.scrollY > 24 && skip()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      gsap.ticker.remove(render)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll)
    }
  }, { scope: root, dependencies: [run, reduced], revertOnUpdate: true })

  function replay() {
    field.current?.reset()
    window.scrollTo({ top: 0 })
    setPlaying(true)
    setRun((r) => r + 1)
  }

  // The backdrop is the homepage's fragment canvas, behind this transparent stage.
  return (
    <section ref={root} aria-label="Mercora AI" className="relative h-[100svh] overflow-hidden">
      <div ref={stage} className="absolute inset-0">
        <div aria-hidden className="intro-ground absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
             style={{ top: `${INTRO.layout.groundRatio * 100}%` }} />
        <div ref={glowEl} aria-hidden className="pointer-events-none absolute rounded-full bg-[radial-gradient(closest-side,rgba(185,223,255,0.35),transparent)]" />
        <div ref={truckEl} className="absolute left-0 will-change-transform">
          <DeliveryTruck wheelRefs={[wheelA, wheelB]} className="block h-auto w-full" />
        </div>
        <div ref={boxEl} className="absolute left-0 top-0 will-change-transform [transform-origin:50%_70%]">
          <PackageOutline flashRef={flashEl} className="block h-full w-full" />
        </div>
        <BrandReveal />
      </div>

      {playing && (
        <button onClick={() => skipRef.current()}
                className="absolute bottom-6 right-6 z-10 rounded-full border border-white/20 px-4 py-2 font-mono text-[11px] tracking-[0.2em] text-white/80 hover:border-white/50 hover:text-white">
          SKIP INTRO
        </button>
      )}
      <div className="intro-after-wrap absolute inset-x-0 bottom-8 z-10 flex justify-center px-4">
        <div className="intro-after invisible flex flex-col items-center gap-5">
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/shop" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#071426] hover:bg-[#B9DFFF]">
              Start shopping <ArrowRight size={15} />
            </Link>
            <button onClick={replay}
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-3 text-sm text-white/85 hover:border-white/60 hover:text-white">
              <RotateCcw size={14} /> Replay
            </button>
          </div>
          <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-white/60">
            SCROLL TO EXPLORE <ArrowDown size={12} className="motion-safe:animate-bounce" />
          </span>
        </div>
      </div>
    </section>
  )
}
