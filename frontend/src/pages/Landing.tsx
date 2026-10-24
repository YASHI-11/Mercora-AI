import { useEffect, useRef } from 'react'
import { useIsFetching } from '@tanstack/react-query'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import FragmentField, { type FieldHandle } from '../components/store/story/FragmentField'
import { PHASE } from '../components/store/story/fragments'
import { story } from '../components/store/story/storyState'
import {
  RecollectScene, BoxScene, WorldScene, FormsScene, ShopScene, FinalScene,
} from '../components/store/story/StoryScenes'
import AISearchPanel from '../components/store/AISearchPanel'

gsap.registerPlugin(ScrollTrigger, useGSAP)
ScrollTrigger.config({ ignoreMobileResize: true })

/**
 * Homepage: the life cycle of one package. The intro's explosion creates a
 * fixed set of fragments (FragmentField); scrolling then recollects them into
 * the box, moves and transforms it, builds a world, forms product outlines
 * beside real products, frames the shop, rings the AI search, and finally
 * rebuilds the box and opens it around the wordmark.
 *
 * Scroll drives one number, `story.target` (the formation phase), through the
 * director below; text and product reveals are scrubbed ScrollTrigger
 * timelines over the same scroll ranges. Everything reverses on the way up.
 */
export default function Landing() {
  const root = useRef<HTMLDivElement>(null)
  const field = useRef<FieldHandle>(null)
  const fetching = useIsFetching()

  // Layout settles as catalogue data and fonts arrive: re-measure the ranges.
  useEffect(() => {
    if (fetching === 0) requestAnimationFrame(() => ScrollTrigger.refresh())
  }, [fetching])
  useEffect(() => {
    document.fonts?.ready.then(() => ScrollTrigger.refresh())
    return () => {
      story.target = 0
    }
  }, [])

  useGSAP(() => {
    const mm = gsap.matchMedia()
    mm.add({ motion: '(prefers-reduced-motion: no-preference)', reduce: '(prefers-reduced-motion: reduce)' }, (ctx) => {
      const { reduce } = ctx.conditions as Record<string, boolean>
      story.reduced = reduce
      story.target = 0
      // Reduced motion: no scroll-driven movement; ordinary, fully visible
      // content over a still fragment field.
      if (reduce) return

      const q = gsap.utils.selector(root)
      const scrub = 0.6

      // The director: each scene maps part of its scroll range onto phase
      // transitions. Between ranges the last phase holds, so the phase is a
      // pure function of scroll position -- deterministic in both directions.
      // (Individual timelines never write shared state; see CLAUDE.md.)
      type Range = { st: ScrollTrigger; a: number; b: number; from: number; to: number }
      const ranges: Range[] = []
      const span = (trigger: string, start: string, end: string, steps: [number, number, number, number][]) => {
        const st = ScrollTrigger.create({ trigger, start, end })
        steps.forEach(([a, b, from, to]) => ranges.push({ st, a, b, from, to }))
      }
      span('.scene-recollect', 'top top', 'bottom bottom', [[0.08, 0.92, PHASE.scattered, PHASE.box]])
      span('.scene-box', 'top top', 'bottom bottom', [
        [0, 0.5, PHASE.box, PHASE.boxMoved],
        [0.55, 1, PHASE.boxMoved, PHASE.structure],
      ])
      span('.scene-world', 'top top', 'bottom bottom', [[0, 0.55, PHASE.structure, PHASE.world]])
      span('.scene-forms', 'top top', 'bottom bottom', [
        [0, 0.26, PHASE.world, PHASE.lantern],
        [0.37, 0.63, PHASE.lantern, PHASE.teapot],
        [0.74, 1, PHASE.teapot, PHASE.necklace],
      ])
      span('.scene-shop', 'top bottom', 'top 25%', [[0, 1, PHASE.necklace, PHASE.frame]])
      span('.scene-ai', 'top bottom', 'top top', [[0, 1, PHASE.frame, PHASE.ring]])
      span('.scene-final', 'top top', 'bottom bottom', [
        [0, 0.4, PHASE.ring, PHASE.finalBox],
        [0.5, 0.85, PHASE.finalBox, PHASE.opened],
      ])
      const direct = () => {
        const y = window.scrollY
        let phase: number = PHASE.scattered
        for (const r of ranges) {
          const len = r.st.end - r.st.start
          const start = r.st.start + len * r.a
          const end = r.st.start + len * r.b
          if (y >= end) phase = r.to
          else if (y > start) { phase = r.from + ((y - start) / (end - start)) * (r.to - r.from); break }
          else break
        }
        story.target = phase
      }

      // ---- 01 Recollect: the brand frame lifts away as the box reassembles.
      gsap.timeline({ scrollTrigger: { trigger: '.scene-recollect', start: 'top top', end: 'bottom bottom', scrub } })
        .to(q('.intro-after-wrap'), { autoAlpha: 0, duration: 0.12, ease: 'none' }, 0)
        .to(q('.brand-reveal'), { yPercent: -45, scale: 0.86, autoAlpha: 0, duration: 0.38, ease: 'none' }, 0)
        .to(q('.intro-ground'), { opacity: 0, duration: 0.1, ease: 'none' }, 0)
        .fromTo(q('.recollect-caption'), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.15, ease: 'none' }, 0.78)
        .set({}, {}, 1)

      // ---- 02 The box moves, transforms, becomes a structure.
      gsap.timeline({ scrollTrigger: { trigger: '.scene-box', start: 'top top', end: 'bottom bottom', scrub } })
        .fromTo(q('.box-c1'), { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.1, ease: 'none' }, 0.03)
        .to(q('.box-c1'), { autoAlpha: 0, y: -40, duration: 0.08, ease: 'none' }, 0.42)
        .fromTo(q('.box-c2'), { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.1, ease: 'none' }, 0.58)
        .to(q('.box-c2'), { autoAlpha: 0, y: -40, duration: 0.08, ease: 'none' }, 0.92)
        .set({}, {}, 1)

      // ---- 03 A new world.
      gsap.timeline({ scrollTrigger: { trigger: '.scene-world', start: 'top top', end: 'bottom bottom', scrub } })
        .fromTo(q('.world-copy'), { autoAlpha: 0, y: 50 }, { autoAlpha: 1, y: 0, duration: 0.18, ease: 'none' }, 0.2)
        .to(q('.world-copy'), { autoAlpha: 0, y: -40, duration: 0.12, ease: 'none' }, 0.86)
        .set({}, {}, 1)

      // ---- 04 Product outlines: each real product card slides in from its
      // own side once the outline beside it is complete.
      const forms = gsap.timeline({ scrollTrigger: { trigger: '.scene-forms', start: 'top top', end: 'bottom bottom', scrub } })
      const windows: [number, number | null][] = [[0.18, 0.32], [0.55, 0.69], [0.92, null]]
      q('.form-card').forEach((card, i) => {
        const dx = i % 2 === 0 ? 60 : -60
        const [inAt, outAt] = windows[i] ?? [0, null]
        forms.fromTo(card, { autoAlpha: 0, x: dx }, { autoAlpha: 1, x: 0, duration: 0.08, ease: 'power1.out' }, inAt)
        if (outAt !== null) forms.to(card, { autoAlpha: 0, x: -dx, duration: 0.05, ease: 'power1.in' }, outAt)
      })
      forms.set({}, {}, 1)

      // ---- 05 The shop: usability first -- short, early reveals.
      gsap.fromTo(q('.shop-head, .shop-coll'), { autoAlpha: 0, y: 30 }, {
        autoAlpha: 1, y: 0, stagger: 0.03, ease: 'none',
        scrollTrigger: { trigger: '.scene-shop', start: 'top 85%', end: 'top 35%', scrub },
      })
      gsap.fromTo(q('.shop-item'), { autoAlpha: 0, y: 30 }, {
        autoAlpha: 1, y: 0, stagger: 0.04, ease: 'none',
        scrollTrigger: { trigger: '.shop-item', start: 'top 95%', end: 'top 60%', scrub },
      })

      // ---- 06 AI: the interface is usable before the ring completes.
      gsap.fromTo(q('.ai-head, .ai-panel, .ai-suggest'), { autoAlpha: 0, y: 30 }, {
        autoAlpha: 1, y: 0, stagger: 0.06, ease: 'none',
        scrollTrigger: { trigger: '.scene-ai', start: 'top 90%', end: 'top 40%', scrub },
      })

      // ---- 07 Final: the box rebuilds, opens, and the wordmark emerges.
      gsap.timeline({ scrollTrigger: { trigger: '.scene-final', start: 'top top', end: 'bottom bottom', scrub } })
        .fromTo(q('.final-letter'), { autoAlpha: 0, y: 30, scale: 1.1 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.2, stagger: 0.015, ease: 'power2.out' }, 0.55)
        .fromTo(q('.final-sub'), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.1, ease: 'none' }, 0.74)
        .fromTo(q('.final-cta'), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.1, ease: 'none' }, 0.8)
        .set({}, {}, 1)

      // Created last, so on a refresh every range is re-measured before it runs.
      ScrollTrigger.create({ start: 0, end: 'max', onUpdate: direct, onRefresh: direct })
      direct()
    })
  }, { scope: root })

  return (
    <div ref={root} className="relative">
      <FragmentField ref={field} />
      <div className="relative z-10">
        <RecollectScene field={field} onIntroDone={() => ScrollTrigger.refresh()} />
        <BoxScene />
        <WorldScene />
        <FormsScene />
        <ShopScene />
        <AISearchPanel />
        <FinalScene />
      </div>
    </div>
  )
}
