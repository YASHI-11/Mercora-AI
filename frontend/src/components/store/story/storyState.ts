// Shared between the scroll director (Landing.tsx, GSAP/ScrollTrigger) and the
// fragment renderer (FragmentField.tsx). Plain mutable state: scrolling never
// re-renders React.

export const story = {
  /** Phase the scroll position asks for (see PHASE in fragments.ts). The
   * renderer eases toward it every frame, so motion is smooth and reversible. */
  target: 0,
  /** prefers-reduced-motion: the renderer jumps straight to `target`. */
  reduced: false,
}
