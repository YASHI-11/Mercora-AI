import { useSearchParams } from 'react-router-dom'
import ShoppingAssistant from '../components/ShoppingAssistant'

export default function Assistant() {
  const [params] = useSearchParams()
  const initial = params.get('q') ?? undefined

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
      <div className="lg:pt-10">
        <p className="eyebrow">AI shopping assistant</p>
        <h1 className="display-section mt-4 font-semibold text-cloud">Tell Us What You Need.</h1>
        <p className="mt-5 max-w-md text-silver">
          Describe an occasion, a budget or a style. The assistant searches the live catalogue, explains its
          picks, and can add them straight to your cart.
        </p>
        <ul className="mt-8 space-y-3 text-sm text-silver">
          <li className="flex gap-3"><span className="font-mono text-cyan">01</span> Only recommends products that exist in the catalogue, at their real prices.</li>
          <li className="flex gap-3"><span className="font-mono text-cyan">02</span> Say “take the 2nd” or “show me more” to refine.</li>
          <li className="flex gap-3"><span className="font-mono text-cyan">03</span> If the AI service is down, it tells you and falls back to keyword search.</li>
        </ul>
      </div>
      <div className="h-[72svh] min-h-[480px]">
        <ShoppingAssistant key={initial} initialQuery={initial} />
      </div>
    </div>
  )
}
