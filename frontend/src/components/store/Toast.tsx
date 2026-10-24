import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle } from 'lucide-react'

import { TOAST_EVENT, type ToastMessage } from '../../lib/toast'

export default function ToastRegion() {
  const [items, setItems] = useState<ToastMessage[]>([])

  useEffect(() => {
    function onToast(e: Event) {
      const msg = (e as CustomEvent<ToastMessage>).detail
      setItems((prev) => [...prev.slice(-2), msg])
      window.setTimeout(() => setItems((prev) => prev.filter((m) => m.id !== msg.id)), 2600)
    }
    window.addEventListener(TOAST_EVENT, onToast)
    return () => window.removeEventListener(TOAST_EVENT, onToast)
  }, [])

  return (
    <div role="status" aria-live="polite"
         className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((m) => (
        <div key={m.id}
             className="pointer-events-auto flex items-center gap-2 rounded-full border border-line bg-graphite/95 px-4 py-2.5 text-sm text-cloud shadow-2xl shadow-black/40 backdrop-blur">
          {m.tone === 'success'
            ? <CheckCircle2 size={15} className="text-cyan" aria-hidden />
            : <AlertTriangle size={15} className="text-amber-400" aria-hidden />}
          {m.text}
        </div>
      ))}
    </div>
  )
}
