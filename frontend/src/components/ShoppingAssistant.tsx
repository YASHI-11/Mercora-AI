import { useState, useRef, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Sparkles, Send, Plus, Check, Star, MessageSquarePlus, AlertTriangle, X } from "lucide-react"
import { api, getCustomerId, getSessionId, resetSessionId } from "../lib/api"
import { useCart } from "../hooks/useCart"
import { useChatHistory } from "../hooks/useChatHistory"
import type { ChatMessage, ShoppingAgentResponse } from "../types"
import ProductImage from "./ProductImage"

const GREETING: ChatMessage = {
  role: "assistant",
  text: 'Hi! Tell me what you\'re shopping for — e.g. "christmas decorations under ₹500".',
}

/** The backend answers each turn with an llm_status; anything other than
 * 'live' means the AI provider didn't handle it and the deterministic
 * keyword parser did, which the customer should be told about rather than
 * silently getting weaker results. */
const LLM_FALLBACK_NOTICES: Record<string, string> = {
  fallback_error: "AI service unavailable — falling back to keyword search, so results may be less precise.",
  fallback_not_configured: "No AI provider configured — using keyword search, so results may be less precise.",
}

export default function ShoppingAssistant({ initialQuery }: {
  /** Sent once on mount, e.g. from a product page's "ask for alternatives" link. */
  initialQuery?: string
} = {}) {
  const [messages, setMessages] = useChatHistory<ChatMessage>("mercora_shopping_chat", [GREETING])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [sessionId, setSessionId] = useState(() => getSessionId("shopping"))
  const [llmNotice, setLlmNotice] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { invalidate } = useCart()
  const customerId = getCustomerId()
  const navigate = useNavigate()

  function newChat() {
    setMessages([GREETING])
    setSessionId(resetSessionId("shopping"))
    setAddingId(null)
    setAddedIds(new Set())
    setInput("")
    setLlmNotice(null)
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, loading])

  // Ref guard: StrictMode runs mount effects twice in development.
  const sentInitial = useRef(false)
  useEffect(() => {
    if (initialQuery && !sentInitial.current) {
      sentInitial.current = true
      send(initialQuery)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery])

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return
    setMessages((m) => [...m, { role: "user", text }])
    setInput("")
    setLoading(true)
    try {
      const { data } = await api.post<ShoppingAgentResponse>("/agent/shop", {
        message: text,
        customer_id: customerId,
        session_id: sessionId,
      })
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.reply, products: data.products, crossSell: data.cross_sell },
      ])
      const notice = data.llm_status ? LLM_FALLBACK_NOTICES[data.llm_status] : undefined
      if (notice) {
        console.warn(`[Mercora] LLM fallback active (llm_status=${data.llm_status}). ${notice}`)
        setLlmNotice(notice)
      } else {
        setLlmNotice(null)
      }
      if (data.redirect_to_checkout) {
        invalidate()
        setTimeout(() => navigate("/checkout"), 1200)
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Sorry, something went wrong reaching the shopping agent." },
      ])
    } finally {
      setLoading(false)
    }
  }

  const ORDINAL_LABELS = ["1st", "2nd", "3rd", "4th"]
  const lastProductMsgIndex = [...messages]
    .map((m, i) => ({ m, i }))
    .reverse()
    .find(({ m }) => m.role === "assistant" && m.products && m.products.length > 0)?.i

  async function addToCart(productId: string) {
    setAddingId(productId)
    try {
      await api.post("/cart/items", { product_id: productId, quantity: 1 }, { params: { customer_id: customerId } })
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
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-graphite">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet/20 text-lavender">
          <Sparkles size={15} />
        </span>
        <span className="font-grotesk text-base font-semibold text-cloud">Mercora AI Assistant</span>
        <button
          onClick={newChat}
          title="Start a new chat"
          className="ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-silver hover:bg-white/5 hover:text-cloud">
          <MessageSquarePlus size={13} /> New chat
        </button>
      </div>
      {llmNotice && (
        <div role="status" className="flex items-start gap-2 border-b border-amber-400/20 bg-amber-400/10 px-5 py-2.5 text-xs leading-snug text-amber-200">
          <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden />
          <span className="flex-1">{llmNotice}</span>
          <button onClick={() => setLlmNotice(null)} aria-label="Dismiss notice" className="shrink-0 hover:text-white">
            <X size={12} />
          </button>
        </div>
      )}
      <div ref={scrollRef} aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[92%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm ${
                m.role === "user" ? "rounded-br-md bg-violet text-white" : "rounded-bl-md bg-graphite-2 text-cloud"
              }`}>
              {m.text}
              {m.products && m.products.length > 0 && (
                <div className="mt-3 space-y-2">
                  {m.products.slice(0, 4).map((p, idx) => {
                    const isAdded = addedIds.has(p._id)
                    const isAdding = addingId === p._id
                    return (
                      <div
                        key={p._id}
                        className={`flex items-center justify-between gap-2 rounded-xl border bg-obsidian/60 px-3 py-2 ${
                          p.best_pick ? "border-cyan/50" : "border-line"
                        }`}>
                        <Link to={`/shop/product/${p._id}`} className="flex min-w-0 items-center gap-2.5 hover:opacity-80">
                          <span className="w-3 shrink-0 font-mono text-[10px] text-silver">{idx + 1}</span>
                          <ProductImage src={p.image} name={p.name} category={p.category}
                                        subcategory={p.subcategory} compact className="h-10 w-10 shrink-0 rounded-lg" />
                          <span className="min-w-0">
                            <span className="block truncate text-xs text-cloud hover:underline">{p.name}</span>
                            <span className="block text-[11px] text-silver">₹{p.price.toLocaleString("en-IN")}</span>
                            {p.best_pick && (
                              <span className="flex items-center gap-0.5 text-[10px] font-medium text-cyan">
                                <Star size={9} className="fill-cyan text-cyan" /> Best pick
                              </span>
                            )}
                          </span>
                        </Link>
                        <button
                          onClick={() => addToCart(p._id)}
                          disabled={isAdding}
                          className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold disabled:opacity-60 ${
                            isAdded ? "bg-emerald-500 text-white" : "bg-cloud text-obsidian hover:bg-white"
                          }`}>
                          {isAdded ? (<><Check size={11} /> Added</>) : (<><Plus size={11} /> {isAdding ? "Adding…" : "Add"}</>)}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {m.role === "assistant" && m.products && m.products.length > 1 && i === lastProductMsgIndex && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.products.slice(0, 4).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => send(ORDINAL_LABELS[idx])}
                      disabled={loading}
                      className="rounded-full border border-line px-3 py-1 text-[11px] font-medium text-silver hover:border-lavender/60 hover:text-cloud disabled:opacity-50">
                      Take the {ORDINAL_LABELS[idx]}
                    </button>
                  ))}
                  <button
                    onClick={() => send("show me more")}
                    disabled={loading}
                    className="rounded-full border border-line px-3 py-1 text-[11px] font-medium text-silver hover:border-lavender/60 hover:text-cloud disabled:opacity-50">
                    Show me more
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start" aria-label="Assistant is thinking">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-graphite-2 px-4 py-3">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-lavender [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-lavender [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-lavender" />
            </div>
          </div>
        )}
      </div>
      <form className="border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); send() }}>
        <div className="flex items-center gap-2">
          <label htmlFor="assistant-input" className="sr-only">Message the shopping assistant</label>
          <input
            id="assistant-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe what you're shopping for…"
            className="flex-1 rounded-full border border-line bg-obsidian px-4 py-3 text-sm text-cloud placeholder:text-silver/70 outline-none focus:border-violet/60"
          />
          <button
            type="submit"
            disabled={loading}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cloud text-obsidian hover:bg-white disabled:opacity-50">
            <Send size={15} />
          </button>
        </div>
      </form>
    </div>
  )
}
