import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, Send, Plus, Check, Star, MessageSquarePlus } from 'lucide-react'
import { api, getCustomerId, getSessionId, resetSessionId } from '../lib/api'
import { useCart } from '../hooks/useCart'
import { useChatHistory } from '../hooks/useChatHistory'
import type { ChatMessage, ShoppingAgentResponse } from '../types'

const GREETING: ChatMessage = {
  role: 'assistant',
  text: "Hi! Tell me what you're shopping for — e.g. \"wireless headphones under ₹4000 for gaming\".",
}

export default function ShoppingAssistant() {
  const [messages, setMessages] = useChatHistory<ChatMessage>('mercora_shopping_chat', [GREETING])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [sessionId, setSessionId] = useState(() => getSessionId('shopping'))
  const scrollRef = useRef<HTMLDivElement>(null)
  const { invalidate } = useCart()
  const customerId = getCustomerId()
  const navigate = useNavigate()

  function newChat() {
    setMessages([GREETING])
    setSessionId(resetSessionId('shopping'))
    setAddingId(null)
    setAddedIds(new Set())
    setInput('')
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return
    setMessages((m) => [...m, { role: 'user', text }])
    setInput('')
    setLoading(true)
    try {
      const { data } = await api.post<ShoppingAgentResponse>('/agent/shop', {
        message: text, customer_id: customerId, session_id: sessionId,
      })
      setMessages((m) => [...m, { role: 'assistant', text: data.reply, products: data.products, crossSell: data.cross_sell }])
      if (data.redirect_to_checkout) {
        invalidate()
        setTimeout(() => navigate('/checkout'), 1200)
      }
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: 'Sorry, something went wrong reaching the shopping agent.' }])
    } finally {
      setLoading(false)
    }
  }

  const ORDINAL_LABELS = ['1st', '2nd', '3rd', '4th']
  const lastProductMsgIndex = [...messages].map((m, i) => ({ m, i }))
    .reverse().find(({ m }) => m.role === 'assistant' && m.products && m.products.length > 0)?.i

  async function addToCart(productId: string) {
    setAddingId(productId)
    try {
      await api.post('/cart/items', { product_id: productId, quantity: 1 }, { params: { customer_id: customerId } })
      invalidate()
      setAddedIds((prev) => new Set(prev).add(productId))
      setTimeout(() => {
        setAddedIds((prev) => {
          const next = new Set(prev)
          next.delete(productId)
          return next
        })
      }, 2000)
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="flex flex-col h-full rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
        <Sparkles size={16} className="text-zinc-700" />
        <span className="text-sm font-semibold text-zinc-900">Shopping Assistant</span>
        <button onClick={newChat} title="Start a new chat"
                className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
          <MessageSquarePlus size={14} /> New chat
        </button>
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
                  {m.products.slice(0, 4).map((p, idx) => {
                    const isAdded = addedIds.has(p._id)
                    const isAdding = addingId === p._id
                    return (
                      <div key={p._id} className={`flex items-center justify-between gap-2 rounded-md bg-white border px-2.5 py-2 ${
                        p.best_pick ? 'border-amber-300 ring-1 ring-amber-200' : 'border-zinc-200'
                      }`}>
                        <Link to={`/shop/product/${p._id}`} className="flex items-center gap-2 min-w-0 hover:opacity-80">
                          <span className="text-[10px] font-semibold text-zinc-400 shrink-0 w-3">{idx + 1}</span>
                          <img src={p.image} className="h-8 w-8 rounded object-cover shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-xs text-zinc-700 truncate hover:underline">{p.name}</span>
                            {p.best_pick && (
                              <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-600">
                                <Star size={9} className="fill-amber-500 text-amber-500" /> Best pick
                              </span>
                            )}
                          </span>
                        </Link>
                        <button onClick={() => addToCart(p._id)} disabled={isAdding}
                                className={`flex items-center gap-1 shrink-0 rounded px-2 py-1 text-[11px] font-medium text-white disabled:opacity-60 ${
                                  isAdded ? 'bg-emerald-600 hover:bg-emerald-600' : 'bg-zinc-900 hover:bg-zinc-700'
                                }`}>
                          {isAdded ? <><Check size={11} /> Added</> : <><Plus size={11} /> {isAdding ? 'Adding…' : 'Add'}</>}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {m.role === 'assistant' && m.products && m.products.length > 1 && i === lastProductMsgIndex && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {m.products.slice(0, 4).map((_, idx) => (
                    <button key={idx} onClick={() => send(ORDINAL_LABELS[idx])} disabled={loading}
                            className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
                      Take the {ORDINAL_LABELS[idx]}
                    </button>
                  ))}
                  <button onClick={() => send('show me more')} disabled={loading}
                          className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
                    Show me more
                  </button>
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
          <button onClick={() => send()} disabled={loading}
                  className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-900 text-white disabled:opacity-50">
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
