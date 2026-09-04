import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, Send, Plus, Check, Star, MessageSquarePlus, AlertTriangle, X } from 'lucide-react'
import { api, getCustomerId, getSessionId, resetSessionId } from '../lib/api'
import { useCart } from '../hooks/useCart'
import { useChatHistory } from '../hooks/useChatHistory'
import type { ChatMessage, ShoppingAgentResponse } from '../types'

const GREETING: ChatMessage = {
  role: 'assistant',
  text: "Hi! Tell me what you're shopping for — e.g. \"wireless headphones under ₹4000 for gaming\".",
}

/** The backend answers each turn with an llm_status; anything other than
 * 'live' means the AI provider didn't handle it and the deterministic
 * keyword parser did, which the customer should be told about rather than
 * silently getting weaker results. */
const LLM_FALLBACK_NOTICES: Record<string, string> = {
  fallback_error: 'AI service unavailable — falling back to keyword search, so results may be less precise.',
  fallback_not_configured: 'No AI provider configured — using keyword search, so results may be less precise.',
}

export default function ShoppingAssistant() {
  const [messages, setMessages] = useChatHistory<ChatMessage>('mercora_shopping_chat', [GREETING])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [sessionId, setSessionId] = useState(() => getSessionId('shopping'))
  const [llmNotice, setLlmNotice] = useState<string | null>(null)
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
    setLlmNotice(null)
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
      const notice = data.llm_status ? LLM_FALLBACK_NOTICES[data.llm_status] : undefined
      if (notice) {
        console.warn(`[Mercora] LLM fallback active (llm_status=${data.llm_status}). ${notice}`)
        setLlmNotice(notice)
      } else {
        setLlmNotice(null)
      }
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
    <div className="flex flex-col h-full rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-zinc-200 px-4 py-3.5 bg-gradient-to-b from-white to-zinc-50/60">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-gold-300">
          <Sparkles size={13} />
        </span>
        <span className="font-display italic text-base text-zinc-900">Shopping Assistant</span>
        <button onClick={newChat} title="Start a new chat"
                className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
          <MessageSquarePlus size={13} /> New chat
        </button>
      </div>
      {llmNotice && (
        <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] leading-snug text-amber-800">
          <AlertTriangle size={13} className="mt-px shrink-0 text-amber-600" />
          <span className="flex-1">{llmNotice}</span>
          <button onClick={() => setLlmNotice(null)} title="Dismiss"
                  className="shrink-0 text-amber-500 hover:text-amber-800">
            <X size={12} />
          </button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-line ${
              m.role === 'user' ? 'bg-ink text-white rounded-br-md' : 'bg-zinc-100 text-zinc-800 rounded-bl-md'
            }`}>
              {m.text}
              {m.products && m.products.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  {m.products.slice(0, 4).map((p, idx) => {
                    const isAdded = addedIds.has(p._id)
                    const isAdding = addingId === p._id
                    return (
                      <div key={p._id} className={`flex items-center justify-between gap-2 rounded-xl bg-white border px-2.5 py-2 ${
                        p.best_pick ? 'border-gold-300 ring-1 ring-gold-100' : 'border-zinc-200'
                      }`}>
                        <Link to={`/shop/product/${p._id}`} className="flex items-center gap-2 min-w-0 hover:opacity-80">
                          <span className="text-[10px] font-semibold text-zinc-400 shrink-0 w-3">{idx + 1}</span>
                          <img src={p.image} className="h-8 w-8 rounded-lg object-cover shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-xs text-zinc-700 truncate hover:underline">{p.name}</span>
                            {p.best_pick && (
                              <span className="flex items-center gap-0.5 text-[10px] font-medium text-gold-600">
                                <Star size={9} className="fill-gold-500 text-gold-500" /> Best pick
                              </span>
                            )}
                          </span>
                        </Link>
                        <button onClick={() => addToCart(p._id)} disabled={isAdding}
                                className={`flex items-center gap-1 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-60 ${
                                  isAdded ? 'bg-emerald-600 hover:bg-emerald-600' : 'bg-ink hover:bg-zinc-800'
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
                            className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:border-gold-300 hover:bg-gold-50 disabled:opacity-50">
                      Take the {ORDINAL_LABELS[idx]}
                    </button>
                  ))}
                  <button onClick={() => send('show me more')} disabled={loading}
                          className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:border-gold-300 hover:bg-gold-50 disabled:opacity-50">
                    Show me more
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-3">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" />
            </div>
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
            className="flex-1 rounded-full border border-zinc-200 px-4 py-2.5 text-sm outline-none focus:border-gold-300 focus:ring-2 focus:ring-gold-100"
          />
          <button onClick={() => send()} disabled={loading}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white hover:bg-zinc-800 disabled:opacity-50">
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
