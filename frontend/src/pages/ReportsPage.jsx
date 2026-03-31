import { Download, FileText, LoaderCircle, Sparkles, ChevronRight, CheckCircle2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import api, { downloadBlob } from '../lib/api'

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');

.rp-root *{box-sizing:border-box}
.rp-root{font-family:'Space Grotesk',sans-serif}
.font-syne{font-family:'Syne',sans-serif}

/* Stage fade-up */
@keyframes stageUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.stage-up{animation:stageUp .5s cubic-bezier(.16,1,.3,1) both}
.s1{animation-delay:.04s}.s2{animation-delay:.1s}.s3{animation-delay:.16s}

/* Loading shimmer */
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
.shimmer{background:linear-gradient(90deg,rgba(255,255,255,.03) 25%,rgba(6,182,212,.07) 50%,rgba(255,255,255,.03) 75%);background-size:200% 100%;animation:shimmer 1.8s ease-in-out infinite}

/* Stage progress dots */
@keyframes dotPulse{0%,80%,100%{transform:scale(0.6);opacity:.3}40%{transform:scale(1);opacity:1}}
.dot-pulse span{display:inline-block;width:5px;height:5px;border-radius:50%;background:#06b6d4;animation:dotPulse 1.2s ease-in-out infinite}
.dot-pulse span:nth-child(2){animation-delay:.2s}
.dot-pulse span:nth-child(3){animation-delay:.4s}

/* Download button */
.dl-btn{
  background:linear-gradient(130deg,rgba(16,185,129,.15),rgba(5,150,105,.1));
  border:1px solid rgba(16,185,129,.25);
  transition:all .2s;position:relative;overflow:hidden;
}
.dl-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(130deg,rgba(16,185,129,.1),transparent);opacity:0;transition:opacity .2s}
.dl-btn:hover:not(:disabled)::before{opacity:1}
.dl-btn:hover:not(:disabled){border-color:rgba(16,185,129,.4);transform:translateY(-1px);box-shadow:0 6px 20px -6px rgba(16,185,129,.3)}
.dl-btn:disabled{opacity:.4;cursor:not-allowed}

/* Preview btn */
.prev-btn{
  background:rgba(6,182,212,.08);border:1px solid rgba(6,182,212,.22);
  transition:all .2s;position:relative;overflow:hidden;
}
.prev-btn:hover:not(:disabled){background:rgba(6,182,212,.13);border-color:rgba(6,182,212,.38);transform:translateY(-1px);box-shadow:0 6px 20px -6px rgba(6,182,212,.25)}
.prev-btn:disabled{opacity:.4;cursor:not-allowed}

/* Field select */
.field-sel{
  width:100%;padding:.65rem 1rem;border-radius:.875rem;font-size:.85rem;color:#fff;
  background:rgba(6,14,30,.9);border:1px solid rgba(255,255,255,.08);outline:none;
  transition:border-color .2s,box-shadow .2s;font-family:'Space Grotesk',sans-serif;
  appearance:none;cursor:pointer;
}
.field-sel:focus{border-color:rgba(6,182,212,.35);box-shadow:0 0 0 3px rgba(6,182,212,.06)}
.field-sel option{background:#0d1f3c}

/* Report card */
.report-card{
  background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);
  transition:border-color .2s,background .2s,transform .15s;
}
.report-card:hover{border-color:rgba(6,182,212,.18);background:rgba(6,182,212,.03);transform:translateY(-1px)}

/* Export btn */
.export-btn{
  display:inline-flex;align-items:center;gap:.5rem;padding:.6rem 1.25rem;
  border-radius:.875rem;font-size:.8125rem;font-weight:500;font-family:'Space Grotesk',sans-serif;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);
  color:rgba(203,213,225,.85);transition:all .2s;cursor:pointer;
}
.export-btn:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18);transform:translateY(-1px)}

/* Preview text area */
.preview-area{
  background:rgba(2,8,20,.7);border:1px solid rgba(255,255,255,.06);
  border-radius:1rem;padding:1rem;
  max-height:52vh;overflow:auto;
  font-size:.6875rem;line-height:1.7;color:rgba(203,213,225,.8);
  white-space:pre-wrap;font-family:'Space Grotesk',sans-serif;
  scrollbar-width:thin;scrollbar-color:rgba(6,182,212,.2) transparent;
}

/* Glow badge */
.glow-badge{
  display:inline-flex;align-items:center;gap:.4rem;
  background:linear-gradient(135deg,rgba(6,182,212,.1),rgba(14,116,144,.08));
  border:1px solid rgba(6,182,212,.2);border-radius:.625rem;
  padding:.25rem .75rem;font-size:.6875rem;color:rgba(103,232,249,.9);
}

/* Panel surface override */
.panel-neo{
  background:linear-gradient(145deg,rgba(8,18,38,.97),rgba(5,12,26,.98));
  border:1px solid rgba(255,255,255,.07);
  border-radius:1.25rem;
}
`

export default function ReportsPage() {
  const { reports, scansData, exportScans, downloadReport, formatDate, toMediaUrl } = useAppContext()

  const [scanId, setScanId] = useState('')
  const [reportType, setReportType] = useState('summary')
  const [previewText, setPreviewText] = useState('')
  const [generatedInfo, setGeneratedInfo] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewStage, setPreviewStage] = useState('')
  const [selectedScanDetail, setSelectedScanDetail] = useState(null)
  const [mediaObjectUrl, setMediaObjectUrl] = useState('')
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [mediaSourceIndex, setMediaSourceIndex] = useState(0)

  const scanOptions = useMemo(() => scansData?.items || [], [scansData?.items])

  const mediaSources = useMemo(() => {
    if (!selectedScanDetail) return []
    const a = toMediaUrl(selectedScanDetail.annotated_video_path)
    const b = toMediaUrl(selectedScanDetail.annotated_image_path)
    const c = toMediaUrl(selectedScanDetail.playback_url)
    if (selectedScanDetail.file_type === 'video') return [c, a].filter((v, i, arr) => Boolean(v) && arr.indexOf(v) === i)
    return [b, c].filter((v, i, arr) => Boolean(v) && arr.indexOf(v) === i)
  }, [selectedScanDetail, toMediaUrl])

  const mediaSource = mediaSources[mediaSourceIndex] || ''
  const resolvedMediaSrc = mediaObjectUrl || mediaSource

  useEffect(() => { setMediaSourceIndex(0); setMediaError('') }, [selectedScanDetail?.id, mediaSources.length])

  useEffect(() => {
    if (!loadingPreview) { setPreviewStage(''); return }
    const stages = ['Preparing AI summary…', 'Analyzing detections & severity…', 'Composing report sections…', 'Finalizing PDF metadata…']
    let idx = 0; setPreviewStage(stages[0])
    const t = setInterval(() => { idx = (idx + 1) % stages.length; setPreviewStage(stages[idx]) }, 1200)
    return () => clearInterval(t)
  }, [loadingPreview])

  useEffect(() => {
    let active = true
    const load = async () => {
      setSelectedScanDetail(null); setPreviewText(''); setGeneratedInfo(null)
      if (!scanId) return
      try {
        const res = await api.get(`/scans/${scanId}`)
        if (active) setSelectedScanDetail(res.data)
      } catch { if (active) { setSelectedScanDetail(null); setMediaError('Could not load selected scan preview.') } }
    }
    load()
    return () => { active = false }
  }, [scanId])

  useEffect(() => {
    let active = true, objUrl = ''
    const load = async () => {
      setMediaError(''); setMediaObjectUrl('')
      if (!selectedScanDetail?.id || !mediaSource) return
      if (!mediaSource.startsWith('/api/')) return
      setMediaLoading(true)
      try {
        const res = await api.get(mediaSource, { responseType: 'blob' })
        objUrl = URL.createObjectURL(res.data)
        if (!active) { URL.revokeObjectURL(objUrl); return }
        setMediaObjectUrl(objUrl)
      } catch { if (active) setMediaError('Could not load media preview.') }
      finally { if (active) setMediaLoading(false) }
    }
    load()
    return () => { active = false; if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [mediaSource, selectedScanDetail?.id])

  const handleMediaError = () => {
    const next = mediaSourceIndex + 1
    if (next < mediaSources.length) { setMediaSourceIndex(next); setMediaError(''); return }
    setMediaError('Could not load any preview. The annotated media may not be generated yet.')
  }

  const createPreview = async () => {
    if (!scanId) return
    setLoadingPreview(true)
    try {
      const res = await api.post(`/reports/${scanId}/generate-preview`, null, { params: { report_type: reportType } })
      setPreviewText(res.data.report_text || '')
      setGeneratedInfo(res.data)
    } finally { setLoadingPreview(false) }
  }

  const downloadGeneratedPreview = async () => {
    if (!generatedInfo?.download_url) return
    await downloadBlob(generatedInfo.download_url, generatedInfo.filename || `scan-${scanId}-${reportType}.pdf`)
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="rp-root space-y-5">

        {/* Hero header */}
        <section className="stage-up s1 rounded-3xl p-6 sm:p-8 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,rgba(9,17,36,.97),rgba(14,36,66,.94),rgba(6,14,22,.95))', border: '1px solid rgba(6,182,212,.1)' }}>
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 80% at 0% 50%, rgba(6,182,212,.04), transparent)' }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-1 w-8 rounded-full" style={{ background: 'linear-gradient(90deg,#06b6d4,transparent)' }} />
              <p className="text-[10px] uppercase tracking-[.2em]" style={{ color: 'rgba(6,182,212,.7)' }}>AI Report Studio</p>
            </div>
            <h1 className="font-syne text-3xl text-white">Generate, Preview & Download</h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: 'rgba(148,163,184,.75)' }}>
              Reports are crafted with AI summary intelligence. Preview content first, then download a polished PDF.
            </p>
          </div>
        </section>

        {/* Export archive */}
        <section className="stage-up s2 panel-neo p-5 sm:p-6">
          <h3 className="text-base font-semibold text-white mb-1">Export scan archive</h3>
          <p className="text-xs mb-4" style={{ color: 'rgba(100,116,139,.9)' }}>Download your complete scan history.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => exportScans('csv')} className="export-btn">
              <Download size={14} /> Export CSV
            </button>
            <button type="button" onClick={() => exportScans('json')} className="export-btn">
              <Download size={14} /> Export JSON
            </button>
          </div>
        </section>

        {/* Main grid */}
        <section className="stage-up s3 grid gap-5 xl:grid-cols-[1.25fr_1fr]">

          {/* Create report */}
          <div className="panel-neo p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-white">Create AI report</h3>
              <div className="glow-badge">
                <Sparkles size={11} />
                Groq + LangGraph
              </div>
            </div>

            {/* Selects */}
            <div className="grid gap-3 sm:grid-cols-2 mb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] mb-1.5" style={{ color: 'rgba(71,85,105,.9)' }}>Choose scan</p>
                <select value={scanId} onChange={e => setScanId(e.target.value)} className="field-sel">
                  <option value="">— Select a scan —</option>
                  {scanOptions.map(s => <option key={s.id} value={s.id}>#{s.id} · {s.original_filename}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.16em] mb-1.5" style={{ color: 'rgba(71,85,105,.9)' }}>Report type</p>
                <select value={reportType} onChange={e => setReportType(e.target.value)} className="field-sel">
                  <option value="summary">Summary</option>
                  <option value="detailed">Detailed</option>
                  <option value="insurance">Insurance</option>
                </select>
              </div>
            </div>

            {/* Media preview */}
            <div className="overflow-hidden rounded-xl mb-4" style={{ background: 'rgba(2,8,20,.8)', border: '1px solid rgba(255,255,255,.06)' }}>
              {mediaLoading ? (
                <div className="shimmer h-52 grid place-items-center text-sm" style={{ color: 'rgba(100,116,139,.8)' }}>Loading preview…</div>
              ) : mediaError ? (
                <div className="h-52 grid place-items-center text-xs text-center px-4" style={{ color: 'rgba(251,113,133,.8)' }}>{mediaError}</div>
              ) : selectedScanDetail?.file_type === 'video' && resolvedMediaSrc ? (
                <video key={resolvedMediaSrc} controls playsInline preload="metadata" onError={handleMediaError}
                  className="w-full object-contain" style={{ maxHeight: '52vh', background: '#020810' }}>
                  <source src={resolvedMediaSrc} type="video/mp4" />
                </video>
              ) : resolvedMediaSrc ? (
                <img src={resolvedMediaSrc} alt="scan preview" onError={handleMediaError} className="h-auto w-full object-contain" style={{ maxHeight: '52vh' }} />
              ) : (
                <div className="h-52 grid place-items-center text-sm" style={{ color: 'rgba(71,85,105,.9)' }}>Select a scan to preview media</div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 mb-3">
              <button type="button" onClick={createPreview} disabled={!scanId || loadingPreview}
                className="prev-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-cyan-200 disabled:opacity-40 disabled:cursor-not-allowed">
                {loadingPreview ? <LoaderCircle size={14} className="animate-spin" /> : <FileText size={14} />}
                Generate preview
              </button>
              <button type="button" onClick={downloadGeneratedPreview} disabled={!generatedInfo?.download_url}
                className="dl-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-emerald-200">
                <Download size={14} />
                Download PDF
              </button>
            </div>

            {/* Loading stage */}
            {loadingPreview && (
              <div className="mb-3 inline-flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs" style={{ background: 'rgba(6,182,212,.07)', border: '1px solid rgba(6,182,212,.18)', color: 'rgba(103,232,249,.9)' }}>
                <div className="dot-pulse flex gap-1"><span /><span /><span /></div>
                {previewStage || 'Generating preview…'}
              </div>
            )}

            {/* Preview text */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold" style={{ color: 'rgba(148,163,184,.8)' }}>Preview</p>
                {previewText && <div className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(34,211,166,.8)' }}><CheckCircle2 size={10} /> Ready</div>}
              </div>
              <div className="preview-area">
                {previewText || <span style={{ color: 'rgba(71,85,105,.8)' }}>Generate a preview to see report content before download.</span>}
              </div>
            </div>
          </div>

          {/* Generated reports */}
          <div className="panel-neo p-5 sm:p-6">
            <h3 className="text-base font-semibold text-white mb-5">Generated reports</h3>
            <div className="space-y-3">
              {reports.map(report => (
                <div key={report.id} className="report-card rounded-xl px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-white">Scan #{report.scan_id}</p>
                      <p className="mt-0.5 text-xs capitalize" style={{ color: 'rgba(100,116,139,.8)' }}>
                        {report.report_type} report
                      </p>
                      <p className="mt-0.5 text-[10px]" style={{ color: 'rgba(71,85,105,.9)' }}>{formatDate(report.generated_at)}</p>
                    </div>
                    <button type="button"
                      onClick={() => downloadReport({ reportId: report.id, scanId: report.scan_id, reportType: report.report_type })}
                      className="dl-btn inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-emerald-200 shrink-0">
                      <Download size={12} /> Download
                    </button>
                  </div>
                </div>
              ))}
              {reports.length === 0 && (
                <div className="rounded-xl px-4 py-10 text-center text-sm" style={{ border: '1px dashed rgba(255,255,255,.07)', color: 'rgba(71,85,105,.9)' }}>
                  No generated reports yet.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}