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
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white h-[70vh] shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-zinc-200 px-4 py-3.5 bg-gradient-to-b from-white to-zinc-50/60">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-gold-300">
          <Sparkles size={13} />
        </span>
        <span className="font-display italic text-base text-zinc-900">AI Growth Copilot</span>
        <button onClick={newChat} title="Start a new chat"
                className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
          <MessageSquarePlus size={13} /> New chat
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-line ${
              m.role === 'user' ? 'bg-ink text-white rounded-br-md' : 'bg-zinc-100 text-zinc-800 rounded-bl-md'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-3 w-fit">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" />
          </div>
        )}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)}
                      className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-gold-300 hover:bg-gold-50">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-zinc-200 p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Ask the growth copilot…"
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
