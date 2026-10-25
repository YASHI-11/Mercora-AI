import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, MessageSquarePlus } from 'lucide-react'
import { api, getSessionId, resetSessionId } from '../../lib/api'
import { useChatHistory } from '../../hooks/useChatHistory'
import type { ChatMessage, Opportunity } from '../../types'

interface GrowthMsg extends ChatMessage {
  opportunities?: Opportunity[]
}

const SUGGESTIONS = [
  'How can I increase revenue?',
  'What bundle opportunities do we have?',
  'Which products are underperforming?',
]

const GREETING: GrowthMsg = {
  role: 'assistant',
  text: 'Ask me anything about your store\'s growth — I ground every answer in your actual order and product data.',
}

export default function Copilot() {
  const [messages, setMessages] = useChatHistory<GrowthMsg>('mercora_growth_chat', [GREETING])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState(() => getSessionId('growth'))
  const scrollRef = useRef<HTMLDivElement>(null)

  function newChat() {
    setMessages([GREETING])
    setSessionId(resetSessionId('growth'))
    setInput('')
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function send(text?: string) {
    const query = (text ?? input).trim()
    if (!query || loading) return
    setMessages((m) => [...m, { role: 'user', text: query }])
    setInput('')
    setLoading(true)
    try {
      const { data } = await api.post('/agent/growth', { message: query, session_id: sessionId })
      setMessages((m) => [...m, { role: 'assistant', text: data.reply, opportunities: data.opportunities }])
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: 'Sorry, the growth agent is unavailable right now.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-[68vh] min-h-[460px] flex-col overflow-hidden rounded-3xl border border-line bg-graphite">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lavender/10 text-lavender">
          <Sparkles size={15} aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-cloud">Growth copilot</p>
          <p className="text-[11px] text-silver">Answers from your orders, products and mined opportunities</p>
        </div>
        <button onClick={newChat} title="Start a new chat"
                className="ml-auto flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-silver hover:border-lavender/50 hover:text-cloud">
          <MessageSquarePlus size={13} /> New chat
        </button>
      </div>
      <div ref={scrollRef} aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              m.role === 'user' ? 'rounded-br-md bg-violet text-on-accent' : 'rounded-bl-md bg-graphite-2 text-cloud'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-graphite-2 px-4 py-3" aria-label="The copilot is thinking">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-lavender [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-lavender [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-lavender" />
          </div>
        )}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)}
                      className="rounded-full border border-line px-3.5 py-2 text-xs text-silver hover:border-lavender/50 hover:text-cloud">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send() }} className="border-t border-line p-3">
        <div className="flex items-center gap-2 rounded-full border border-line bg-obsidian/70 py-1 pl-4 pr-1 focus-within:border-lavender/60">
          <label htmlFor="copilot-input" className="sr-only">Ask the growth copilot</label>
          <input id="copilot-input" value={input} onChange={(e) => setInput(e.target.value)}
                 placeholder="Ask about revenue, bundles, slow movers…"
                 className="min-w-0 flex-1 bg-transparent py-2 text-sm text-cloud outline-none placeholder:text-silver/70" />
          <button type="submit" disabled={loading || !input.trim()} aria-label="Send"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cloud text-obsidian hover:bg-white disabled:opacity-40">
            <Send size={15} />
          </button>
        </div>
      </form>
    </div>
  )
}
