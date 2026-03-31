import { LoaderCircle, MessageSquare, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import api from '../lib/api'

const getDefaultAssistantMessages = () => [
  {
    role: 'assistant',
    text: 'I can help interpret your scan results and suggest practical next steps for repair decisions.',
  },
]

export default function AssistantPage() {
  const { scansData, formatDate } = useAppContext()
  const [messages, setMessages] = useState(getDefaultAssistantMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedScanId, setSelectedScanId] = useState('')

  const scanOptions = useMemo(() => scansData?.items || [], [scansData?.items])

  useEffect(() => {
    const loadContextHistory = async () => {
      if (!selectedScanId) {
        setMessages(getDefaultAssistantMessages())
        return
      }

      try {
        const res = await api.get(`/chat/scan/${selectedScanId}/history`)
        const history = Array.isArray(res.data)
          ? res.data.map((item) => ({ role: item.role, text: item.text }))
          : []

        if (history.length > 0) {
          setMessages(history)
        } else {
          setMessages(getDefaultAssistantMessages())
        }
      } catch {
        setMessages(getDefaultAssistantMessages())
      }
    }

    loadContextHistory()
  }, [selectedScanId])

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading])

  const sendMessage = async (event) => {
    event.preventDefault()
    if (!canSend) return

    const userText = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: userText }])
    setLoading(true)

    try {
      const endpoint = selectedScanId ? `/chat/scan/${selectedScanId}` : '/chat/agent'
      const res = await api.post(endpoint, {
        message: userText,
      })

      setMessages((prev) => [...prev, { role: 'assistant', text: res.data.reply }])
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Could not reach AI assistant.'
      setMessages((prev) => [...prev, { role: 'assistant', text: detail }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-emerald-200/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,.2),rgba(4,12,24,.95)_60%)] p-5 sm:p-6 lg:p-8">
        <p className="text-xs uppercase tracking-[0.15em] text-emerald-200/80">AI Assistant</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Damage AI Chat Assistant</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Ask anything about your damage scans and get actionable repair guidance.
        </p>
      </section>

      <section className="panel-surface rounded-2xl p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">Conversation</h3>
        </div>

        <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/45 p-3">
          <label htmlFor="assistant-scan-select" className="mb-1 block text-xs uppercase tracking-[0.08em] text-slate-300">
            Optional scan context
          </label>
          <select
            id="assistant-scan-select"
            value={selectedScanId}
            onChange={(event) => setSelectedScanId(event.target.value)}
            className="field-input"
          >
            <option value="">General assistant (all recent scans)</option>
            {scanOptions.map((scan) => (
              <option key={scan.id} value={scan.id}>
                #{scan.id} • {scan.original_filename} • {scan.severity?.toUpperCase()} • {formatDate(scan.created_at)}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-400">
            When a scan is selected, the assistant answers using that image/video result only.
          </p>
        </div>

        <div className="max-h-[55vh] space-y-3 overflow-auto rounded-xl border border-slate-700 bg-slate-950/40 p-3">
          {messages.map((msg, idx) => (
            <div
              key={`${msg.role}-${idx}`}
              className={`rounded-xl px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'ml-auto max-w-[80%] border border-cyan-200/30 bg-cyan-500/10 text-cyan-100'
                  : 'mr-auto max-w-[86%] border border-slate-700 bg-slate-900/75 text-slate-200'
              }`}
            >
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.08em] opacity-80">
                <MessageSquare size={12} />
                {msg.role}
              </div>
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          ))}
          {loading ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/75 px-3 py-2 text-sm text-slate-300">
              <LoaderCircle size={14} className="animate-spin" />
              Thinking...
            </div>
          ) : null}
        </div>

        <form onSubmit={sendMessage} className="mt-4 flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about damage details, repair estimate, or inspection priorities..."
            className="field-input"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 disabled:opacity-50"
          >
            <Send size={14} />
            Send
          </button>
        </form>
      </section>
    </div>
  )
}
