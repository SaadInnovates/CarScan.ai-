import { LoaderCircle, Upload, CheckCircle2, Clock, Filter, FileVideo, Image, ChevronDown, X, Zap } from 'lucide-react'
import { useState } from 'react'
import { useAppContext } from '../context/AppContext'
import api, { downloadBlob } from '../lib/api'
import { getDamageChipStyle } from '../lib/damageColors'

const SEV_CFG = {
  low:      { dot: '#22d3a6', bg: 'rgba(34,211,166,.1)',  border: 'rgba(34,211,166,.25)', text: 'rgba(110,231,183,.95)' },
  medium:   { dot: '#fb923c', bg: 'rgba(251,146,60,.1)',  border: 'rgba(251,146,60,.25)', text: 'rgba(253,186,116,.95)' },
  high:     { dot: '#fb7185', bg: 'rgba(251,113,133,.1)', border: 'rgba(251,113,133,.25)', text: 'rgba(253,164,175,.95)' },
  critical: { dot: '#ef4444', bg: 'rgba(239,68,68,.1)',   border: 'rgba(239,68,68,.25)',  text: 'rgba(252,165,165,.95)' },
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');
.sp-root *{box-sizing:border-box}
.sp-root{font-family:'Space Grotesk',sans-serif}
.font-syne{font-family:'Syne',sans-serif}

@keyframes stageUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.stage-up{animation:stageUp .5s cubic-bezier(.16,1,.3,1) both}
.s1{animation-delay:.04s}.s2{animation-delay:.1s}

/* Panel */
.panel-neo{background:linear-gradient(145deg,rgba(8,18,38,.97),rgba(5,12,26,.98));border:1px solid rgba(255,255,255,.07);border-radius:1.25rem}

/* Scan card */
.scan-card{
  background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.065);
  border-radius:1rem;transition:border-color .2s,background .2s,transform .15s;
  overflow:hidden;
}
.scan-card:hover{border-color:rgba(6,182,212,.16);background:rgba(6,182,212,.025)}

/* Upload area */
.upload-zone{
  border:1.5px dashed rgba(6,182,212,.2);border-radius:1rem;
  background:rgba(6,182,212,.03);transition:border-color .2s,background .2s;
  cursor:pointer;
}
.upload-zone:hover,.upload-zone.drag-over{border-color:rgba(6,182,212,.4);background:rgba(6,182,212,.06)}

/* Inputs */
.field-inp{
  width:100%;padding:.65rem 1rem;border-radius:.875rem;font-size:.85rem;color:#fff;
  background:rgba(6,14,30,.9);border:1px solid rgba(255,255,255,.08);outline:none;
  transition:border-color .2s,box-shadow .2s;font-family:'Space Grotesk',sans-serif;appearance:none;
}
.field-inp:focus{border-color:rgba(6,182,212,.35);box-shadow:0 0 0 3px rgba(6,182,212,.06)}
.field-inp::placeholder{color:rgba(100,116,139,.5)}
.field-inp option{background:#0d1f3c}
.field-file{width:100%;padding:.65rem 1rem;border-radius:.875rem;font-size:.85rem;color:rgba(148,163,184,.8);background:rgba(6,14,30,.9);border:1px solid rgba(255,255,255,.08);outline:none;font-family:'Space Grotesk',sans-serif;cursor:pointer;transition:border-color .2s}
.field-file:focus{border-color:rgba(6,182,212,.35)}
.field-file::file-selector-button{margin-right:.75rem;padding:.35rem .875rem;border-radius:.625rem;border:none;background:rgba(6,182,212,.15);color:rgba(103,232,249,.9);font-size:.8125rem;font-family:'Space Grotesk',sans-serif;font-weight:500;cursor:pointer;transition:background .2s}
.field-file::file-selector-button:hover{background:rgba(6,182,212,.25)}

/* Upload button */
.upload-btn{
  display:inline-flex;align-items:center;gap:.5rem;padding:.7rem 1.5rem;border-radius:.875rem;
  font-size:.875rem;font-weight:600;font-family:'Space Grotesk',sans-serif;cursor:pointer;
  background:linear-gradient(130deg,#0891b2,#06b6d4 50%,#0e7490);
  box-shadow:0 4px 24px -6px rgba(6,182,212,.55),0 0 0 1px rgba(6,182,212,.15) inset;
  color:#fff;transition:box-shadow .2s,transform .15s;position:relative;overflow:hidden;
}
.upload-btn::before{content:'';position:absolute;top:-50%;left:-60%;width:35%;height:200%;background:rgba(255,255,255,.12);transform:skewX(-15deg);transition:left .5s}
.upload-btn:hover:not(:disabled)::before{left:140%}
.upload-btn:hover:not(:disabled){box-shadow:0 8px 32px -6px rgba(6,182,212,.75),0 0 0 1px rgba(6,182,212,.25) inset;transform:translateY(-1px)}
.upload-btn:disabled{opacity:.5;cursor:not-allowed}

/* Report preview btn */
.rpt-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.4rem .875rem;border-radius:.75rem;font-size:.75rem;font-family:'Space Grotesk',sans-serif;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);color:rgba(110,231,183,.9);transition:all .2s;cursor:pointer}
.rpt-btn:hover:not(:disabled){background:rgba(16,185,129,.14);border-color:rgba(16,185,129,.35)}
.rpt-btn:disabled{opacity:.4;cursor:not-allowed}

/* Open detail btn */
.det-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.4rem .875rem;border-radius:.75rem;font-size:.75rem;font-family:'Space Grotesk',sans-serif;background:rgba(6,182,212,.08);border:1px solid rgba(6,182,212,.2);color:rgba(103,232,249,.9);transition:all .2s;cursor:pointer}
.det-btn:hover{background:rgba(6,182,212,.14);border-color:rgba(6,182,212,.35)}

/* DL pdf btn */
.pdf-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.35rem .75rem;border-radius:.625rem;font-size:.6875rem;font-family:'Space Grotesk',sans-serif;background:rgba(6,182,212,.08);border:1px solid rgba(6,182,212,.18);color:rgba(103,232,249,.9);transition:all .2s;cursor:pointer}
.pdf-btn:hover{background:rgba(6,182,212,.14);border-color:rgba(6,182,212,.3)}

/* Filter bar */
.filter-bar{background:rgba(6,182,212,.03);border:1px solid rgba(6,182,212,.1);border-radius:1rem;padding:.875rem 1rem}
.filter-toggle{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem .875rem;border-radius:.75rem;font-size:.75rem;cursor:pointer;border:1px solid rgba(255,255,255,.08);color:rgba(100,116,139,.9);font-family:'Space Grotesk',sans-serif;transition:all .2s}
.filter-toggle:hover{border-color:rgba(255,255,255,.15);color:#fff}
.filter-toggle-on{background:rgba(6,182,212,.09);border-color:rgba(6,182,212,.28);color:rgba(103,232,249,.9)}

/* Progress */
@keyframes progressSlide{0%{transform:translateX(-100%)}100%{transform:translateX(150%)}};
.progress-shimmer{position:relative;overflow:hidden;background:rgba(6,182,212,.1);border-radius:9999px}
.progress-shimmer::after{content:'';position:absolute;inset-y-0;width:40%;background:linear-gradient(90deg,transparent,rgba(6,182,212,.6),transparent);animation:progressSlide 1.4s ease-in-out infinite}

/* Preview area */
.preview-pre{max-height:11rem;overflow:auto;white-space:pre-wrap;font-size:.6875rem;line-height:1.7;color:rgba(203,213,225,.8);padding:.875rem 1rem;background:rgba(2,8,20,.7);border-radius:.75rem;font-family:'Space Grotesk',sans-serif;scrollbar-width:thin;scrollbar-color:rgba(6,182,212,.15) transparent}

/* Page btn */
.page-btn{padding:.5rem .875rem;border-radius:.75rem;font-size:.75rem;border:1px solid rgba(255,255,255,.08);color:rgba(148,163,184,.8);transition:all .2s;cursor:pointer;font-family:'Space Grotesk',sans-serif}
.page-btn:hover:not(:disabled){border-color:rgba(255,255,255,.18);color:#fff}
.page-btn:disabled{opacity:.3;cursor:not-allowed}

/* Select (for report type per scan) */
.mini-sel{padding:.4rem .75rem;border-radius:.75rem;font-size:.75rem;color:rgba(203,213,225,.85);background:rgba(6,14,30,.9);border:1px solid rgba(255,255,255,.08);outline:none;font-family:'Space Grotesk',sans-serif;appearance:none;cursor:pointer;transition:border-color .2s}
.mini-sel:focus{border-color:rgba(6,182,212,.3)}
.mini-sel option{background:#0d1f3c}
`

function SeverityBadge({ severity }) {
  const cfg = SEV_CFG[severity] || SEV_CFG.low
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize"
      style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.text }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.dot, ...(severity === 'critical' ? { animation: 'pulse 1s ease-in-out infinite' } : {}) }} />
      {severity}
    </span>
  )
}

export default function ScansPage() {
  const { historyFilters, setHistoryFilters, scansData, loadingKey, uploadScan, openScanDetail, showError, showMessage, toMediaUrl, formatDate } = useAppContext()

  const [form, setForm] = useState({ file: null, notes: '' })
  const [reportTypeByScan, setReportTypeByScan] = useState({})
  const [reportPreviewByScan, setReportPreviewByScan] = useState({})
  const [reportLoadingByScan, setReportLoadingByScan] = useState({})
  const [filtersOpen, setFiltersOpen] = useState(false)

  const getReportType = (id) => reportTypeByScan[id] || 'summary'
  const isUploading = loadingKey === 'upload'

  const submitUpload = async (e) => {
    e.preventDefault()
    if (!form.file) return
    await uploadScan(form)
    setForm({ file: null, notes: '' })
  }

  const generateReportPreview = async (scanId) => {
    const reportType = getReportType(scanId)
    setReportLoadingByScan(p => ({ ...p, [scanId]: true }))
    try {
      const res = await api.post(`/reports/${scanId}/generate-preview`, null, { params: { report_type: reportType } })
      setReportPreviewByScan(p => ({
        ...p, [scanId]: {
          reportType, reportText: res.data?.report_text || '',
          downloadUrl: res.data?.download_url || '',
          filename: res.data?.filename || `scan-${scanId}-${reportType}.pdf`,
        },
      }))
      showMessage(`${reportType} preview ready.`)
    } catch (err) { showError(err) }
    finally { setReportLoadingByScan(p => ({ ...p, [scanId]: false })) }
  }

  const downloadPreviewReport = async (scanId) => {
    const p = reportPreviewByScan[scanId]
    if (!p?.downloadUrl) return
    await downloadBlob(p.downloadUrl, p.filename)
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="sp-root space-y-5 pb-12">

        {/* Upload section */}
        <section className="stage-up s1 panel-neo p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg,rgba(6,182,212,.2),rgba(14,116,144,.1))', border: '1px solid rgba(6,182,212,.2)' }}>
              <Upload size={17} style={{ color: '#06b6d4' }} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Upload scan</h2>
              <p className="text-xs" style={{ color: 'rgba(100,116,139,.8)' }}>Images & videos — AI annotates automatically</p>
            </div>
            {isUploading && (
              <div className="ml-auto flex items-center gap-2 text-xs" style={{ color: 'rgba(6,182,212,.8)' }}>
                <Zap size={11} /> Processing with AI…
              </div>
            )}
          </div>

          <form onSubmit={submitUpload} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] mb-1.5" style={{ color: 'rgba(71,85,105,.9)' }}>Vehicle file</p>
              <input type="file" accept=".jfif,image/*,video/*" required
                onChange={e => setForm(p => ({ ...p, file: e.target.files?.[0] || null }))}
                className="field-file" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] mb-1.5" style={{ color: 'rgba(71,85,105,.9)' }}>Inspection notes</p>
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes…" className="field-inp" />
            </div>
            <button type="submit" disabled={isUploading || !form.file} className="upload-btn" style={{ height: 44 }}>
              {isUploading ? <><LoaderCircle size={15} className="animate-spin" /> Processing…</> : <><Upload size={14} /> Upload</>}
            </button>
          </form>

          {/* Progress bar */}
          {isUploading && (
            <div className="mt-3 progress-shimmer h-1 rounded-full" />
          )}

          {form.file && !isUploading && (
            <p className="mt-2 text-xs" style={{ color: 'rgba(71,85,105,.9)' }}>
              Selected: <span style={{ color: 'rgba(203,213,225,.8)' }}>{form.file.name}</span>
              {' '}({(form.file.size / 1024 / 1024).toFixed(1)} MB)
            </p>
          )}
        </section>

        {/* Scan history */}
        <section className="stage-up s2 panel-neo p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-white">Scan history</h2>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(100,116,139,.8)' }}>{scansData.total} scans total</p>
            </div>
            <button type="button" onClick={() => setFiltersOpen(p => !p)}
              className={`filter-toggle ${filtersOpen ? 'filter-toggle-on' : ''}`}>
              <Filter size={11} /> Filters
              <ChevronDown size={11} style={{ transform: filtersOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
            </button>
          </div>

          {/* Filters */}
          {filtersOpen && (
            <div className="filter-bar mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { key: 'severity', opts: [['', 'All severities'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical']] },
                { key: 'file_type', opts: [['', 'All types'], ['image', 'Image'], ['video', 'Video']] },
                { key: 'sort', opts: [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['severity_high', 'High severity first']] },
              ].map(({ key, opts }) => (
                <select key={key} value={historyFilters[key] || ''} onChange={e => setHistoryFilters(p => ({ ...p, [key]: e.target.value, page: 1 }))} className="field-inp text-xs">
                  {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ))}
              <select value={historyFilters.per_page} onChange={e => setHistoryFilters(p => ({ ...p, per_page: Number(e.target.value), page: 1 }))} className="field-inp text-xs">
                {[10, 20, 30].map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </div>
          )}

          {/* Cards */}
          <div className="space-y-2">
            {scansData.items.length === 0 && (
              <div className="py-14 text-center">
                <CheckCircle2 size={28} className="mx-auto mb-2" style={{ color: 'rgba(51,65,85,.9)' }} />
                <p className="text-sm" style={{ color: 'rgba(71,85,105,.9)' }}>No scans match the current filters.</p>
              </div>
            )}

            {scansData.items.map(scan => (
              <div key={scan.id} className="scan-card">
                {/* Main row */}
                <div className="grid gap-3 p-3.5 sm:grid-cols-[52px_1fr_auto] sm:items-center">
                  {/* Thumb */}
                  <div className="h-[52px] w-[52px] rounded-xl overflow-hidden shrink-0" style={{ background: 'rgba(6,14,30,.9)', border: '1px solid rgba(255,255,255,.07)' }}>
                    {scan.thumbnail_path
                      ? <img src={toMediaUrl(scan.thumbnail_path)} alt="" className="h-full w-full object-cover" />
                      : <div className="h-full w-full grid place-items-center" style={{ color: 'rgba(51,65,85,.9)' }}>
                          {scan.file_type === 'video' ? <FileVideo size={18} /> : <Image size={18} />}
                        </div>
                    }
                  </div>

                  {/* Meta */}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{scan.original_filename}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]" style={{ color: 'rgba(71,85,105,.9)' }}>
                      <span className="capitalize">{scan.file_type}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1"><Clock size={9} />{formatDate(scan.created_at)}</span>
                      <span>·</span>
                      <span>{scan.total_detections} detection{scan.total_detections !== 1 ? 's' : ''}</span>
                    </div>
                    {scan.damage_labels && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {String(scan.damage_labels).split(',').map(l => l.trim()).filter(Boolean).slice(0, 4).map(label => (
                          <span key={`${scan.id}-${label}`} style={getDamageChipStyle({ label, category: '' })} className="rounded-full border px-2 py-0.5 text-[10px]">{label}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <SeverityBadge severity={scan.severity} />
                    <select value={getReportType(scan.id)} onChange={e => setReportTypeByScan(p => ({ ...p, [scan.id]: e.target.value }))} className="mini-sel">
                      <option value="summary">Summary</option>
                      <option value="detailed">Detailed</option>
                      <option value="insurance">Insurance</option>
                    </select>
                    <button type="button" onClick={() => generateReportPreview(scan.id)} disabled={Boolean(reportLoadingByScan[scan.id])} className="rpt-btn">
                      {reportLoadingByScan[scan.id]
                        ? <><LoaderCircle size={11} className="animate-spin" /> Generating…</>
                        : 'Preview report'}
                    </button>
                    <button type="button" onClick={() => openScanDetail(scan.id)} className="det-btn">
                      {loadingKey === `scan-${scan.id}`
                        ? <><LoaderCircle size={11} className="animate-spin" /> Loading…</>
                        : 'Open detail'}
                    </button>
                  </div>
                </div>

                {/* Report preview */}
                {reportPreviewByScan[scan.id] && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,.06)' }} className="px-3.5 pb-3.5 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(6,182,212,.7)' }}>
                        {reportPreviewByScan[scan.id].reportType} report preview
                      </p>
                      <button type="button" onClick={() => downloadPreviewReport(scan.id)} className="pdf-btn">Download PDF</button>
                    </div>
                    <div className="preview-pre">{reportPreviewByScan[scan.id].reportText || 'No preview text returned.'}</div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {scansData.pages > 1 && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
              <p className="text-xs" style={{ color: 'rgba(71,85,105,.9)' }}>
                Page <span style={{ color: 'rgba(203,213,225,.8)' }}>{scansData.page}</span> of {scansData.pages}
                <span className="ml-2" style={{ color: 'rgba(51,65,85,.9)' }}>({scansData.total} total)</span>
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={historyFilters.page <= 1}
                  onClick={() => setHistoryFilters(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
                  className="page-btn">← Prev</button>
                <button type="button" disabled={historyFilters.page >= scansData.pages}
                  onClick={() => setHistoryFilters(p => ({ ...p, page: Math.min(scansData.pages, p.page + 1) }))}
                  className="page-btn">Next →</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  )
}