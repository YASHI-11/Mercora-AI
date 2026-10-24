// The MERCORA AI wordmark as real HTML typography. Each letter is its own span
// (`.brand-letter`) so the intro timeline can bring them in as the particle
// field expands; screen readers get the plain name from the heading.

const WORD = 'MERCORA'
const ACCENT = 'AI'

export default function BrandReveal() {
  return (
    <div className="brand-reveal pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
      {/* The hero headline is the page's h1; the wordmark is presentational text. */}
      <p className="font-grotesk font-bold leading-none tracking-[0.06em] text-white [font-size:clamp(2.6rem,11vw,9rem)]">
        <span className="sr-only">Mercora AI</span>
        <span aria-hidden className="inline-flex">
          {WORD.split('').map((ch, i) => <span key={i} className="brand-letter inline-block">{ch}</span>)}
          <span className="inline-block w-[0.28em]" />
          {ACCENT.split('').map((ch, i) => <span key={`a${i}`} className="brand-letter inline-block text-[#B9DFFF]">{ch}</span>)}
        </span>
      </p>
      <span aria-hidden className="brand-line mt-6 block h-px w-[min(60vw,420px)] origin-center bg-gradient-to-r from-transparent via-[#B9DFFF] to-transparent" />
      <p className="brand-sub mt-6 font-mono text-[11px] tracking-[0.42em] text-[#B9DFFF] sm:text-xs">SHOPPING, REIMAGINED.</p>
    </div>
  )
}
