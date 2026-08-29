import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, Plus } from 'lucide-react'
import { api, getCustomerId, getSessionId } from '../lib/api'
import { useCart } from '../hooks/useCart'
import { useChatHistory } from '../hooks/useChatHistory'
import type { ChatMessage, ShoppingAgentResponse } from '../types'

export default function ShoppingAssistant() {
  const [messages, setMessages] = useChatHistory<ChatMessage>('mercora_shopping_chat', [
    { role: 'assistant', text: "Hi! Tell me what you're shopping for — e.g. \"wireless headphones under ₹4000 for gaming\"." },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { invalidate } = useCart()
  const customerId = getCustomerId()
  const sessionId = getSessionId('shopping')

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setMessages((m) => [...m, { role: 'user', text }])
    setInput('')
    setLoading(true)
    try {
      const { data } = await api.post<ShoppingAgentResponse>('/agent/shop', {
        message: text, customer_id: customerId, session_id: sessionId,
      })
      setMessages((m) => [...m, { role: 'assistant', text: data.reply, products: data.products, crossSell: data.cross_sell }])
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: 'Sorry, something went wrong reaching the shopping agent.' }])
    } finally {
      setLoading(false)
    }
  }

  async function addToCart(productId: string) {
    await api.post('/cart/items', { product_id: productId, quantity: 1 }, { params: { customer_id: customerId } })
    invalidate()
  }

  return (
    <div className="flex flex-col h-full rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
        <Sparkles size={16} className="text-zinc-700" />
        <span className="text-sm font-semibold text-zinc-900">Shopping Assistant</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[92%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-line ${
              m.role === 'user' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-800'
            }`}>
              {m.text}
              {m.products && m.products.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  {m.products.slice(0, 4).map((p) => (
                    <div key={p._id} className="flex items-center justify-between gap-2 rounded-md bg-white border border-zinc-200 px-2.5 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <img src={p.image} className="h-8 w-8 rounded object-cover shrink-0" />
                        <span className="text-xs text-zinc-700 truncate">{p.name}</span>
                      </div>
                      <button onClick={() => addToCart(p._id)}
                              className="flex items-center gap-1 shrink-0 rounded bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-zinc-700">
                        <Plus size={11} /> Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-zinc-100 px-3.5 py-2.5 text-sm text-zinc-400">Thinking…</div>
          </div>
        )}
      </div>
      <div className="border-t border-zinc-200 p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Ask Mercora AI…"
            className="flex-1 rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
          <button onClick={send} disabled={loading}
                  className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-900 text-white disabled:opacity-50">
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
