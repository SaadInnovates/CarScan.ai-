import { Bot, Download, FileText, LoaderCircle, Send, Shield, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useAppContext } from '../context/AppContext'
import { getDamageChipStyle } from '../lib/damageColors'
import api from '../lib/api'

const getDefaultChatMessages = () => [
  {
    role: 'assistant',
    text: 'Ask me about this scan: detections, severity, confidence, frames, or report guidance.',
  },
]

const severityBadge = {
  low:      'text-emerald-300 bg-emerald-400/10 border-emerald-400/30',
  medium:   'text-amber-300 bg-amber-400/10 border-amber-400/30',
  high:     'text-rose-300 bg-rose-400/10 border-rose-400/30',
  critical: 'text-red-300 bg-red-400/10 border-red-400/30',
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-center">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-white">{value ?? '—'}</p>
    </div>
  )
}

export default function ScanDetailModal() {
  const {
    selectedScan,
    setSelectedScan,
    loadingKey,
    generateReport,
    deleteScan,
    downloadAnnotatedScan,
  } = useAppContext()

  const [chatOpen,       setChatOpen]       = useState(false)
  const [chatInput,      setChatInput]      = useState('')
  const [chatLoading,    setChatLoading]    = useState(false)
  const [chatMessages,   setChatMessages]   = useState(getDefaultChatMessages)
  const [detectionsOpen, setDetectionsOpen] = useState(true)

  // ── Media state ──────────────────────────────────────────────────────────
  // mediaState: 'idle' | 'loading' | 'ready' | 'error'
  const [mediaState,     setMediaState]     = useState('idle')
  const [mediaObjectUrl, setMediaObjectUrl] = useState(null)
  const [mediaError,     setMediaError]     = useState('')
  const [showVideo,      setShowVideo]      = useState(false)
  // Track whether the resolved media is actually a video blob or an image blob
  const [resolvedIsVideo, setResolvedIsVideo] = useState(false)

  const chatEndRef    = useRef(null)
  // Keep a ref to the current blob URL so cleanup always has the latest value
  const blobUrlRef    = useRef(null)

  const canUsePremiumReports = true
  const canSendChat = useMemo(() => chatInput.trim().length > 0 && !chatLoading, [chatInput, chatLoading])

  const isSummaryGenerating   = loadingKey === `report-${selectedScan?.id}-summary`
  const isDetailedGenerating  = loadingKey === `report-${selectedScan?.id}-detailed`
  const isInsuranceGenerating = loadingKey === `report-${selectedScan?.id}-insurance`

  // ── Revoke old blob URL helper ───────────────────────────────────────────
  const revokeCurrent = useCallback(() => {
    if (blobUrlRef.current) {
      window.URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  // ── Fetch media blob ─────────────────────────────────────────────────────
  const fetchMediaPreview = useCallback(async (scanId) => {
    if (!scanId) return
    revokeCurrent()
    setMediaState('loading')
    setMediaError('')
    setMediaObjectUrl(null)
    setResolvedIsVideo(false)

    try {
      const res = await api.get(`/scans/${scanId}/preview`, { responseType: 'blob' })
      const blob = res.data
      const mime = blob.type || res.headers['content-type'] || ''

      const objUrl = window.URL.createObjectURL(blob)
      blobUrlRef.current = objUrl
      setMediaObjectUrl(objUrl)
      setResolvedIsVideo(mime.startsWith('video/'))
      setMediaState('ready')
    } catch (err) {
      const status = err?.response?.status
      setMediaError(
        status === 404
          ? 'Annotated media file not found on server.'
          : 'Could not load media preview. Please retry.'
      )
      setMediaState('error')
    }
  }, [revokeCurrent])

  // ── Reset everything when selected scan changes ──────────────────────────
  useEffect(() => {
    revokeCurrent()
    setMediaState('idle')
    setMediaObjectUrl(null)
    setMediaError('')
    setShowVideo(false)
    setResolvedIsVideo(false)
    setChatOpen(false)
    setChatMessages(getDefaultChatMessages())

    if (selectedScan?.id) {
      // For images load immediately; for video wait for user click
      if (selectedScan.file_type !== 'video') {
        fetchMediaPreview(selectedScan.id)
      }
    }

    return revokeCurrent
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScan?.id])

  // ── Load chat history ────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!selectedScan?.id) { setChatMessages(getDefaultChatMessages()); return }
      try {
        const res     = await api.get(`/chat/scan/${selectedScan.id}/history`)
        const history = Array.isArray(res.data)
          ? res.data.map((m) => ({ role: m.role, text: m.text }))
          : []
        setChatMessages(history.length > 0 ? history : getDefaultChatMessages())
      } catch {
        setChatMessages(getDefaultChatMessages())
      }
    }
    load()
  }, [selectedScan?.id])

  // ── Auto-scroll chat ─────────────────────────────────────────────────────
  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading, chatOpen])

  // ── Chat send ────────────────────────────────────────────────────────────
  const sendScanChatMessage = async (event) => {
    event.preventDefault()
    if (!selectedScan?.id || !canSendChat) return
    const userText = chatInput.trim()
    setChatInput('')
    setChatMessages((p) => [...p, { role: 'user', text: userText }])
    setChatLoading(true)
    try {
      const res = await api.post(`/chat/scan/${selectedScan.id}`, { message: userText })
      setChatMessages((p) => [...p, { role: 'assistant', text: res.data.reply }])
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Could not reach scan chatbot.'
      setChatMessages((p) => [...p, { role: 'assistant', text: detail }])
    } finally {
      setChatLoading(false)
    }
  }

  if (!selectedScan) return null

  const detections  = selectedScan.detections || []
  const isVideoScan = selectedScan.file_type === 'video'

  // ── Handle "View Video" click ────────────────────────────────────────────
  const handleViewVideoClick = () => {
    setShowVideo(true)
    // Only fetch if we haven't already
    if (mediaState === 'idle' || mediaState === 'error') {
      fetchMediaPreview(selectedScan.id)
    }
  }

  // ── Media renderer ───────────────────────────────────────────────────────
  const renderMedia = () => {
    // ── Video scan ──────────────────────────────────────────────────────
    if (isVideoScan) {
      if (!showVideo) {
        return (
          <div className="grid h-52 place-items-center">
            <button
              type="button"
              className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-5 py-2.5 text-sm text-cyan-200 hover:bg-cyan-500/20 transition-colors"
              onClick={handleViewVideoClick}
            >
              ▶ View Video
            </button>
          </div>
        )
      }

      if (mediaState === 'loading') {
        return (
          <div className="grid h-52 place-items-center gap-2">
            <LoaderCircle size={22} className="animate-spin text-cyan-400" />
            <p className="text-xs text-slate-500">Loading video…</p>
          </div>
        )
      }

      if (mediaState === 'error') {
        return (
          <div className="grid h-52 place-items-center gap-2 text-sm text-rose-300">
            <p>{mediaError}</p>
            <button
              type="button"
              className="underline text-cyan-400"
              onClick={() => fetchMediaPreview(selectedScan.id)}
            >
              Retry
            </button>
          </div>
        )
      }

      if (mediaState === 'ready' && mediaObjectUrl) {
        // Backend resolved an image fallback (annotated frame) instead of a video
        if (!resolvedIsVideo) {
          return (
            <div className="space-y-1">
              <img
                src={mediaObjectUrl}
                alt="annotated frame"
                className="h-auto w-full"
              />
              <p className="px-2 pb-1 text-center text-[10px] text-slate-500">
                Annotated frame preview (video file unavailable)
              </p>
            </div>
          )
        }

        // True video blob — use object URL directly in <video>
        return (
          <video
            key={mediaObjectUrl}          // force remount when URL changes
            controls
            playsInline
            preload="metadata"
            className="h-auto w-full"
            onError={() => {
              setMediaState('error')
              setMediaError('Browser could not play this video. Try downloading it instead.')
            }}
          >
            {/* No <source> type here — let the browser sniff from the blob */}
            <source src={mediaObjectUrl} />
            Your browser does not support the video tag.
          </video>
        )
      }

      return (
        <div className="grid h-52 place-items-center text-sm text-slate-500">
          Video unavailable.
        </div>
      )
    }

    // ── Image scan ──────────────────────────────────────────────────────
    if (mediaState === 'loading') {
      return (
        <div className="grid h-52 place-items-center gap-2">
          <LoaderCircle size={22} className="animate-spin text-cyan-400" />
          <p className="text-xs text-slate-500">Loading media…</p>
        </div>
      )
    }

    if (mediaState === 'error') {
      return (
        <div className="grid h-52 place-items-center gap-2 text-sm text-rose-300">
          <p>{mediaError}</p>
          <button
            type="button"
            className="underline text-cyan-400"
            onClick={() => fetchMediaPreview(selectedScan.id)}
          >
            Retry Preview
          </button>
        </div>
      )
    }

    if (mediaState === 'ready' && mediaObjectUrl) {
      return (
        <img
          src={mediaObjectUrl}
          alt="annotated scan"
          className="h-auto w-full"
          onError={() => {
            setMediaState('error')
            setMediaError('Could not render image.')
          }}
        />
      )
    }

    return (
      <div className="grid h-52 place-items-center text-sm text-slate-500">
        No annotated media available.
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/85 p-3 sm:p-5 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setSelectedScan(null) }}
    >
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-700/80 bg-[#070f1c] shadow-2xl">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-800/80 bg-[#070f1c]/95 px-5 py-4 backdrop-blur-sm">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-cyan-400/60">Scan Detail</p>
            <h3 className="mt-0.5 truncate text-lg font-semibold text-white">{selectedScan.original_filename}</h3>
          </div>
          <button
            type="button"
            onClick={() => setSelectedScan(null)}
            className="shrink-0 rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:border-slate-600 hover:text-slate-200 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">

            {/* ── Left: media + stats ──────────────────────────────────── */}
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950/60 min-h-[200px]">
                {renderMedia()}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Detections" value={selectedScan.total_detections} />
                <StatCard label="Confidence"  value={selectedScan.confidence_avg} />
                <StatCard
                  label="Severity"
                  value={
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${severityBadge[selectedScan.severity] || severityBadge.low}`}>
                      {selectedScan.severity}
                    </span>
                  }
                />
              </div>

              {selectedScan.video_summary && (
                <div className="rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-3 text-xs text-slate-400 grid grid-cols-3 gap-2">
                  <div><span className="block text-[10px] uppercase tracking-wider text-slate-600 mb-0.5">Frames</span>{selectedScan.video_summary.frames_analyzed}</div>
                  <div><span className="block text-[10px] uppercase tracking-wider text-slate-600 mb-0.5">FPS</span>{selectedScan.video_summary.video_fps}</div>
                  <div><span className="block text-[10px] uppercase tracking-wider text-slate-600 mb-0.5">Resolution</span>{selectedScan.video_summary.video_resolution}</div>
                </div>
              )}
            </div>

            {/* ── Right: actions + detections + chat ──────────────────── */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => downloadAnnotatedScan(selectedScan.id)}
                className="btn-secondary w-full justify-center text-sm"
              >
                <Download size={14} /> Download annotated file
              </button>

              <div className="grid grid-cols-1 gap-2">
                {[
                  { key: 'summary',   icon: FileText, label: 'Summary report',   loading: isSummaryGenerating,   premium: false },
                  { key: 'detailed',  icon: FileText, label: 'Detailed report',   loading: isDetailedGenerating,  premium: true  },
                  { key: 'insurance', icon: Shield,   label: 'Insurance report',  loading: isInsuranceGenerating, premium: true  },
                ].map(({ key, icon: Icon, label, loading, premium }) => (
                  <button
                    key={key}
                    type="button"
                    disabled={loading || (premium && !canUsePremiumReports)}
                    onClick={() => generateReport(selectedScan.id, key)}
                    className="btn-secondary w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? <LoaderCircle size={14} className="animate-spin" /> : <Icon size={14} />}
                    {loading ? `Generating ${key}…` : label}
                  </button>
                ))}
              </div>

              {!canUsePremiumReports && (
                <p className="rounded-xl border border-amber-400/20 bg-amber-500/8 px-3 py-2 text-xs text-amber-200">
                  Detailed and insurance reports require Pro plan.
                </p>
              )}

              <button
                type="button"
                onClick={() => setChatOpen((p) => !p)}
                className="btn-secondary w-full justify-center text-sm"
              >
                <Bot size={14} />
                {chatOpen ? 'Hide chatbot' : 'Chat about this scan'}
              </button>

              <button
                type="button"
                onClick={() => deleteScan(selectedScan.id)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-500/8 px-4 py-2.5 text-sm text-rose-300 hover:bg-rose-500/12 transition-colors"
              >
                {loadingKey === `delete-${selectedScan.id}` ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                Delete scan
              </button>

              {/* Detections list */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/50">
                <button
                  type="button"
                  onClick={() => setDetectionsOpen((p) => !p)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-white"
                >
                  <span>Detected labels <span className="ml-1.5 text-xs text-slate-500">({detections.length})</span></span>
                  {detectionsOpen ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                </button>

                {detectionsOpen && (
                  <div className="border-t border-slate-700/60 px-3 pb-3 pt-2 max-h-52 space-y-2 overflow-auto">
                    {detections.length === 0 ? (
                      <p className="text-xs text-slate-500">No detections recorded.</p>
                    ) : detections.map((det, idx) => (
                      <div
                        key={`${det.label}-${idx}`}
                        className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-xs text-slate-300"
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <span
                            style={getDamageChipStyle({ label: det.label, category: det.damage_category })}
                            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                          >
                            {det.label}
                          </span>
                          {det.damage_category && (
                            <span
                              style={getDamageChipStyle({ label: det.damage_category, category: det.damage_category })}
                              className="rounded-full border px-2 py-0.5 text-[10px]"
                            >
                              {det.damage_category}
                            </span>
                          )}
                          <span className="ml-auto text-slate-500">{det.confidence}</span>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          ({Math.round(det.bbox?.x1 || 0)}, {Math.round(det.bbox?.y1 || 0)}) →{' '}
                          ({Math.round(det.bbox?.x2 || 0)}, {Math.round(det.bbox?.y2 || 0)})
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Chat panel */}
              {chatOpen && (
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5">
                  <p className="border-b border-slate-700/60 px-4 py-2.5 text-sm font-semibold text-white">
                    Scan Chatbot
                  </p>
                  <div className="h-64 space-y-2 overflow-auto p-3">
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={`${msg.role}-${idx}`}
                        className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                          msg.role === 'user'
                            ? 'ml-auto max-w-[88%] border border-cyan-400/25 bg-cyan-500/10 text-cyan-100'
                            : 'mr-auto max-w-[94%] border border-slate-700 bg-slate-900/70 text-slate-200'
                        }`}
                      >
                        {msg.text}
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="mr-auto inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
                        <LoaderCircle size={12} className="animate-spin" /> Thinking…
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <form onSubmit={sendScanChatMessage} className="flex gap-2 border-t border-slate-700/60 p-3">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask about this scan…"
                      className="field-input text-xs"
                    />
                    <button
                      type="submit"
                      disabled={!canSendChat}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 disabled:opacity-50 transition-colors hover:bg-cyan-500/15"
                    >
                      <Send size={12} /> Send
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}