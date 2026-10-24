// Every timing and geometry parameter of the homepage intro, in one place.
// Times are seconds on the master GSAP timeline; *Units values are in the
// truck SVG's own coordinate system (see DeliveryTruck's viewBox).

export const INTRO = {
  colors: { navy: '#071426', midnight: '#0B1D35', white: '#FFFFFF', ice: '#B9DFFF' },

  // Truck geometry (viewBox 0 0 420 200; the truck faces left, cargo at the back/right).
  truck: {
    viewW: 420,
    viewH: 200,
    groundUnits: 194, // wheel bottoms
    wheelRadiusUnits: 26,
    wheels: [{ cx: 92, cy: 168 }, { cx: 340, cy: 168 }],
    cargoFloorUnits: 148, // top of the cargo floor the package rides on
    boxUnits: 64, // package size inside the cargo area
    boxRightUnits: 396, // the package rides against the rear wall
  },

  // Layout, as fractions of the viewport (one formula for every screen size).
  layout: {
    truckWidthRatio: 0.6,
    truckWidthMin: 280,
    truckWidthMax: 820,
    groundRatio: 0.6, // ground line, from the top of the viewport
    offscreen: 40, // px beyond the viewport edge where the truck starts/ends
  },

  // Motion.
  truckDuration: 3.3, // right edge -> left edge, constant speed so the drop can be solved exactly
  fallDuration: 0.8, // release -> landing
  popHeight: 0.22, // upward hop out of the cargo bay, as a fraction of the package size
  fallTilt: -11, // degrees of rotation during the fall
  vibrateStart: 3.0, // earliest start; pushed later if the package lands late
  vibrateDuration: 1.05,
  explodeDelay: 0.05, // after the vibration peaks
  logoDelay: 0.25, // after the explosion
  subtitleDelay: 1.05, // after the logo starts
  settle: 2.2, // logo start -> sequence complete (~6.6s total)

  // Seam sparks and edge flashes during the vibration (fractions of its duration;
  // closer together towards the end so the build-up accelerates).
  sparkAt: [0.18, 0.42, 0.6, 0.73, 0.83, 0.9, 0.95],
  flashAt: [0.34, 0.58, 0.76, 0.87, 0.94],

  // Particle budget, scaled by viewport area.
  particles: { perPixel: 1 / 6500, min: 70, max: 230 },

  /** Full playback once per browser session; later visits start on the brand frame. */
  sessionKey: 'mercora_intro_seen',
} as const

/** PackageOutline's edges (its viewBox units): the explosion breaks the box apart along these. */
export const PACKAGE_EDGES: [number, number, number, number][] = [
  [8, 34, 70, 34], [70, 34, 70, 96], [70, 96, 8, 96], [8, 96, 8, 34], // front
  [8, 34, 30, 12], [30, 12, 92, 12], [92, 12, 70, 34], // top
  [92, 12, 92, 74], [92, 74, 70, 96], // side
  [39, 34, 61, 12], // flap seam
]
