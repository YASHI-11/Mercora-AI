import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send } from 'lucide-react'
import { api, getSessionId } from '../../lib/api'
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

export default function Copilot() {
  const [messages, setMessages] = useChatHistory<GrowthMsg>('mercora_growth_chat', [
    { role: 'assistant', text: 'Ask me anything about your store\'s growth — I ground every answer in your actual order and product data.' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sessionId = getSessionId('growth')

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
    <div className="flex flex-col rounded-lg border border-zinc-200 bg-white h-[70vh]">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
        <Sparkles size={16} className="text-zinc-700" />
        <span className="text-sm font-semibold text-zinc-900">AI Growth Copilot</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-line ${
              m.role === 'user' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-800'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && <div className="text-sm text-zinc-400">Analyzing store data…</div>}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)}
                      className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50">
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
