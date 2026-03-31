// AnalyticsDashboard.jsx
// Drop-in analytics page for CarScan AI — works for both regular users and admins.
// Fetches from the unified /admin/analytics endpoint and renders the correct
// dashboard variant based on the `scope` field returned by the API.

import { useEffect, useState, useCallback } from 'react'
import {
  Activity, AlertTriangle, BarChart2, Download, RefreshCw,
  ShieldAlert, TrendingUp, Users, Zap, FileText, Eye,
  Cpu, Clock, Target, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import fetchAnalytics, { downloadBlob } from '../lib/adminAnalytics'

// ── tiny helpers ─────────────────────────────────────────────────────────────

const SEVERITY_COLORS = {
  low:      { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25', bar: '#10b981' },
  medium:   { bg: 'bg-amber-500/15',   text: 'text-amber-400',   border: 'border-amber-500/25',   bar: '#f59e0b' },
  high:     { bg: 'bg-orange-500/15',  text: 'text-orange-400',  border: 'border-orange-500/25',  bar: '#f97316' },
  critical: { bg: 'bg-rose-500/15',    text: 'text-rose-400',    border: 'border-rose-500/25',    bar: '#f43f5e' },
}

const CHART_PALETTE = ['#06b6d4', '#818cf8', '#34d399', '#fb923c', '#f472b6', '#a78bfa', '#38bdf8', '#4ade80']

function fmt(n) {
  if (n === undefined || n === null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ── base UI atoms ─────────────────────────────────────────────────────────────

function Card({ children, className = '', glow = false }) {
  return (
    <div className={`
      relative rounded-2xl border border-white/[0.07] p-5
      bg-gradient-to-br from-[#0b1628]/90 to-[#060e1e]/95
      ${glow ? 'shadow-[0_0_40px_-12px_rgba(6,182,212,0.18)]' : ''}
      ${className}
    `}>
      {children}
    </div>
  )
}

function SectionLabel({ icon: Icon, label, sub }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20">
        <Icon size={13} className="text-cyan-400" />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
        {sub && <p className="text-[10px] text-slate-600">{sub}</p>}
      </div>
    </div>
  )
}

function StatTile({ icon: Icon, label, value, sub, trend, color = 'cyan' }) {
  const colors = {
    cyan:   'from-cyan-500/10  border-cyan-500/20  text-cyan-400',
    violet: 'from-violet-500/10 border-violet-500/20 text-violet-400',
    emerald:'from-emerald-500/10 border-emerald-500/20 text-emerald-400',
    amber:  'from-amber-500/10  border-amber-500/20  text-amber-400',
    rose:   'from-rose-500/10   border-rose-500/20   text-rose-400',
  }[color] ?? 'from-cyan-500/10 border-cyan-500/20 text-cyan-400'

  return (
    <Card className={`bg-gradient-to-br ${colors.split(' ')[0]} hover:border-white/10 transition-all duration-300`}>
      <div className={`mb-3 inline-flex h-8 w-8 items-center justify-center rounded-xl border ${colors.split(' ')[1]}`}>
        <Icon size={15} className={colors.split(' ')[2]} />
      </div>
      <p className="font-display text-3xl tracking-wide text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-400">{label}</p>
      {sub && <p className="mt-1 text-[10px] text-slate-600">{sub}</p>}
      {trend !== undefined && (
        <div className={`mt-2 inline-flex items-center gap-1 text-[10px] font-medium ${trend >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {trend >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
          {Math.abs(trend)}%
        </div>
      )}
    </Card>
  )
}

// ── mini sparkline (pure SVG, no deps) ───────────────────────────────────────

function Sparkline({ data = [], color = '#06b6d4', height = 36 }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const W = 200, H = height
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - ((v - min) / range) * (H - 4) - 2,
  ])
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const fill = `${path} L${W},${H} L0,${H} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg-${color.replace('#','')})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── horizontal bar ────────────────────────────────────────────────────────────

function HBar({ label, value, max, color = '#06b6d4', sub }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="group flex items-center gap-3 py-1.5">
      <div className="w-24 shrink-0 truncate text-[11px] text-slate-400 group-hover:text-slate-300 transition-colors">{label}</div>
      <div className="flex-1 rounded-full bg-white/[0.04] h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="w-10 text-right text-[11px] font-medium text-slate-300">{fmt(value)}</div>
      {sub && <div className="text-[10px] text-slate-600">{sub}</div>}
    </div>
  )
}

// ── stacked bar chart (SVG) ───────────────────────────────────────────────────

function StackedBarChart({ months = [], severities = [], counts = {}, height = 120 }) {
  if (!months.length) return null
  const totals = months.map((_, i) => severities.reduce((s, sev) => s + (counts[sev]?.[i] ?? 0), 0))
  const maxVal = Math.max(...totals, 1)
  const barW = Math.max(4, Math.floor(480 / months.length) - 3)
  const gap   = Math.floor(480 / months.length)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 480 ${height + 24}`} className="w-full min-w-[320px]" preserveAspectRatio="xMidYMid meet">
        {months.map((m, i) => {
          let y = height
          return (
            <g key={m}>
              {severities.map((sev, si) => {
                const v = counts[sev]?.[i] ?? 0
                const h = (v / maxVal) * height
                y -= h
                return (
                  <rect
                    key={sev}
                    x={i * gap + (gap - barW) / 2}
                    y={y}
                    width={barW}
                    height={h}
                    fill={SEVERITY_COLORS[sev]?.bar ?? CHART_PALETTE[si]}
                    rx="1"
                    opacity="0.85"
                  />
                )
              })}
              <text
                x={i * gap + gap / 2}
                y={height + 16}
                textAnchor="middle"
                fontSize="7"
                fill="#475569"
              >
                {m.slice(5)}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3">
        {severities.map(sev => (
          <div key={sev} className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="h-2 w-2 rounded-sm" style={{ background: SEVERITY_COLORS[sev]?.bar }} />
            {sev}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── donut chart (SVG) ─────────────────────────────────────────────────────────

function DonutChart({ labels = [], counts = [], size = 120 }) {
  if (!labels.length) return null
  const total = counts.reduce((a, b) => a + b, 0) || 1
  const R = 40, cx = size / 2, cy = size / 2
  let angle = -Math.PI / 2

  const arcs = labels.reduce((acc, label, i) => {
    const startAngle = acc.length > 0 ? acc[acc.length - 1].endAngle : angle
    const slice = (counts[i] / total) * 2 * Math.PI
    const endAngle = startAngle + slice
    const x1 = cx + R * Math.cos(startAngle)
    const y1 = cy + R * Math.sin(startAngle)
    const x2 = cx + R * Math.cos(endAngle)
    const y2 = cy + R * Math.sin(endAngle)
    const large = slice > Math.PI ? 1 : 0
    return [...acc, { label, count: counts[i], pct: ((counts[i] / total) * 100).toFixed(1), x1, y1, x2, y2, large, endAngle, color: CHART_PALETTE[i % CHART_PALETTE.length] }]
  }, [])

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
        <circle cx={cx} cy={cy} r={R + 6} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="12" />
        {arcs.map((arc, i) => (
          <path
            key={i}
            d={`M${cx},${cy} L${arc.x1},${arc.y1} A${R},${R} 0 ${arc.large},1 ${arc.x2},${arc.y2} Z`}
            fill={arc.color}
            opacity="0.85"
          />
        ))}
        <circle cx={cx} cy={cy} r={R * 0.55} fill="#060e1e" />
        <text x={cx} y={cy + 3} textAnchor="middle" fontSize="10" fill="#94a3b8" fontWeight="600">{labels.length}</text>
        <text x={cx} y={cy + 13} textAnchor="middle" fontSize="6" fill="#475569">types</text>
      </svg>
      <div className="grid grid-cols-1 gap-1 text-[11px] w-full">
        {arcs.slice(0, 6).map((arc, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: arc.color }} />
            <span className="flex-1 truncate text-slate-400">{arc.label}</span>
            <span className="font-medium text-slate-300">{arc.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── line chart (SVG) ─────────────────────────────────────────────────────────

function LineChart({ labels = [], datasets = [], height = 100 }) {
  if (!labels.length) return null
  const allVals = datasets.flatMap(d => d.data)
  const maxVal  = Math.max(...allVals, 1)
  const W = 480

  const toPath = (data) =>
    data.map((v, i) => {
      const x = (i / (data.length - 1)) * W
      const y = height - (v / maxVal) * (height - 6) - 3
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${height + 20}`} className="w-full min-w-[300px]" preserveAspectRatio="xMidYMid meet">
        {/* grid lines */}
        {[0.25, 0.5, 0.75, 1].map(f => {
          const y = height - f * (height - 6) - 3
          return <line key={f} x1="0" y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        })}
        {datasets.map((ds, di) => (
          <g key={di}>
            <defs>
              <linearGradient id={`lg-${di}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ds.color} stopOpacity="0.2" />
                <stop offset="100%" stopColor={ds.color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`${toPath(ds.data)} L${W},${height} L0,${height} Z`}
              fill={`url(#lg-${di})`}
            />
            <path d={toPath(ds.data)} fill="none" stroke={ds.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
        {/* x-axis labels — show every 4th */}
        {labels.map((lbl, i) => i % 4 === 0 && (
          <text key={i} x={(i / (labels.length - 1)) * W} y={height + 14} textAnchor="middle" fontSize="7" fill="#475569">
            {lbl.slice(5)}
          </text>
        ))}
      </svg>
      {datasets.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-3">
          {datasets.map((ds, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span className="h-0.5 w-4 rounded-full" style={{ background: ds.color }} />
              {ds.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── skeleton loader ───────────────────────────────────────────────────────────

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.04] ${className}`} />
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
      </div>
      <Skeleton className="h-40" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function UserDashboard({ data }) {
  const { user_summary, severity_trends, report_type_distribution } = data

  const sevBreakdown = user_summary?.severity_breakdown ?? {}
  const totalSev = Object.values(sevBreakdown).reduce((a, b) => a + b, 0) || 1

  return (
    <div className="space-y-5">
      {/* summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={Target} label="Total Scans" value={fmt(user_summary?.total_scans)}      color="cyan"   />
        <StatTile icon={Clock}  label="Last 30 Days" value={fmt(user_summary?.scans_last_30_days)} color="violet" />
        <StatTile icon={ShieldAlert} label="High / Critical"
          value={fmt((sevBreakdown.high ?? 0) + (sevBreakdown.critical ?? 0))}
          color="rose"
        />
        <StatTile icon={Activity} label="Low / Medium"
          value={fmt((sevBreakdown.low ?? 0) + (sevBreakdown.medium ?? 0))}
          color="emerald"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* severity breakdown */}
        <Card>
          <SectionLabel icon={AlertTriangle} label="Severity Breakdown" sub="All-time scan severity distribution" />
          <div className="space-y-2">
            {['critical','high','medium','low'].map(sev => (
              <div key={sev}>
                <div className="mb-1 flex justify-between text-[10px]">
                  <span className={SEVERITY_COLORS[sev].text + ' capitalize font-medium'}>{sev}</span>
                  <span className="text-slate-500">{((sevBreakdown[sev] ?? 0) / totalSev * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/[0.04]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${(sevBreakdown[sev] ?? 0) / totalSev * 100}%`,
                      background: SEVERITY_COLORS[sev].bar,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* report type distribution */}
        <Card>
          <SectionLabel icon={FileText} label="Report Types" sub="Distribution of generated report types" />
          <DonutChart
            labels={report_type_distribution?.types ?? []}
            counts={report_type_distribution?.counts ?? []}
          />
        </Card>
      </div>

      {/* severity trends */}
      <Card>
        <SectionLabel icon={TrendingUp} label="Severity Trends" sub="Your scan severities over the last 12 months" />
        <StackedBarChart
          months={severity_trends?.months ?? []}
          severities={severity_trends?.severities ?? []}
          counts={severity_trends?.counts ?? {}}
        />
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function AdminDashboard({ data }) {
  const {
    platform_stats, user_growth, daily_active_users,
    churn_rate, avg_scans, most_active_users,
    damage_label_frequency, scan_file_type_distribution,
    top_report_types, severity_trends, report_type_distribution,
    activity_stats,
  } = data

  const maxDamage = Math.max(...(damage_label_frequency?.counts ?? [0]))
  const maxActive = Math.max(...(most_active_users?.users ?? []).map(u => u.scan_count), 1)

  return (
    <div className="space-y-5">

      {/* ── platform stat tiles ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <StatTile icon={Users}    label="Total Users"  value={fmt(platform_stats?.total_users)}  color="cyan"    />
        <StatTile icon={Zap}      label="Pro Users"    value={fmt(platform_stats?.pro_users)}    color="violet"  />
        <StatTile icon={BarChart2}label="Total Scans"  value={fmt(platform_stats?.total_scans)}  color="emerald" />
        <StatTile icon={Activity} label="Active 7d"    value={fmt(activity_stats?.active_users_last_7_days)} color="amber" />
        <StatTile icon={AlertTriangle} label="Churn %"
          value={`${churn_rate?.churn_rate_percent ?? 0}%`}
          color={churn_rate?.churn_rate_percent > 5 ? 'rose' : 'emerald'}
          sub={`${churn_rate?.churned ?? 0} users`}
        />
      </div>

      {/* ── row 2: user growth + daily active ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionLabel icon={TrendingUp} label="User Growth" sub="New registrations — last 12 months" />
          <LineChart
            labels={user_growth?.months ?? []}
            datasets={[{ label: 'New users', data: user_growth?.user_counts ?? [], color: '#06b6d4' }]}
          />
        </Card>

        <Card>
          <SectionLabel icon={Activity} label="Daily Active Users" sub="Last 30 days" />
          <Sparkline data={daily_active_users?.active_users ?? []} height={80} />
          <div className="mt-2 flex justify-between text-[10px] text-slate-600">
            <span>{daily_active_users?.days?.[0]?.slice(5) ?? ''}</span>
            <span>{daily_active_users?.days?.at(-1)?.slice(5) ?? ''}</span>
          </div>
        </Card>
      </div>

      {/* ── row 3: severity trends + scans per day ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionLabel icon={ShieldAlert} label="Severity Trends" sub="Platform-wide — last 12 months" />
          <StackedBarChart
            months={severity_trends?.months ?? []}
            severities={severity_trends?.severities ?? []}
            counts={severity_trends?.counts ?? {}}
          />
        </Card>

        <Card>
          <SectionLabel icon={BarChart2} label="Scans Per Day" sub="Last 14 days" />
          <LineChart
            labels={(activity_stats?.scans_per_day ?? []).map(d => d.day)}
            datasets={[{
              label: 'Scans',
              data: (activity_stats?.scans_per_day ?? []).map(d => d.count),
              color: '#818cf8',
            }]}
            height={90}
          />
        </Card>
      </div>

      {/* ── row 4: report type + file type ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <SectionLabel icon={FileText} label="Report Types" sub="All-time distribution" />
          <DonutChart
            labels={report_type_distribution?.types ?? []}
            counts={report_type_distribution?.counts ?? []}
          />
        </Card>

        <Card>
          <SectionLabel icon={Cpu} label="File Types" sub="Image vs Video scans" />
          <DonutChart
            labels={scan_file_type_distribution?.file_types ?? []}
            counts={scan_file_type_distribution?.counts ?? []}
            size={100}
          />
        </Card>

        <Card>
          <SectionLabel icon={FileText} label="Top Report Types" sub="Last 30 days" />
          <div className="space-y-1">
            {(top_report_types?.types ?? []).map((type, i) => (
              <HBar
                key={type}
                label={type}
                value={top_report_types.counts[i]}
                max={Math.max(...(top_report_types.counts ?? [1]))}
                color={CHART_PALETTE[i % CHART_PALETTE.length]}
              />
            ))}
          </div>
        </Card>
      </div>

      {/* ── row 5: damage labels + most active users ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionLabel icon={AlertTriangle} label="Damage Label Frequency" sub="Most common detected damage types" />
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
            {(damage_label_frequency?.labels ?? [])
              .map((lbl, i) => ({ lbl, cnt: damage_label_frequency.counts[i] }))
              .sort((a, b) => b.cnt - a.cnt)
              .slice(0, 12)
              .map(({ lbl, cnt }, i) => (
                <HBar key={lbl} label={lbl} value={cnt} max={maxDamage} color={CHART_PALETTE[i % CHART_PALETTE.length]} />
              ))
            }
          </div>
        </Card>

        <Card>
          <SectionLabel icon={Users} label="Most Active Users" sub="Top 10 by scan count" />
          <div className="space-y-1">
            {(most_active_users?.users ?? []).map((u, i) => (
              <div key={u.email} className="flex items-center gap-2.5 py-1">
                <span className="w-4 text-center text-[10px] font-bold text-slate-600">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[11px] text-slate-300">{u.email}</p>
                  <div className="mt-0.5 h-1 w-full rounded-full bg-white/[0.04]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(u.scan_count / maxActive) * 100}%`, background: CHART_PALETTE[i % CHART_PALETTE.length] }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-[11px] font-medium text-slate-400">{fmt(u.scan_count)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── row 6: avg scans + churn detail ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="col-span-2">
          <SectionLabel icon={BarChart2} label="Average Scans / User" />
          <div className="flex gap-6">
            <div>
              <p className="font-display text-3xl text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                {avg_scans?.average_lifetime ?? '—'}
              </p>
              <p className="text-[10px] text-slate-500">Lifetime avg</p>
            </div>
            <div className="w-px bg-white/[0.06]" />
            <div>
              <p className="font-display text-3xl text-cyan-400" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                {avg_scans?.average_last_30_days ?? '—'}
              </p>
              <p className="text-[10px] text-slate-500">Last 30 days avg</p>
            </div>
          </div>
        </Card>

        <Card className="col-span-2">
          <SectionLabel icon={Users} label="Plan Distribution" />
          <div className="flex gap-4 flex-wrap">
            {[
              { label: 'Free',  val: platform_stats?.free_users,  color: '#94a3b8' },
              { label: 'Pro',   val: platform_stats?.pro_users,   color: '#06b6d4' },
              { label: 'Admin', val: platform_stats?.admin_users, color: '#818cf8' },
            ].map(({ label, val, color }) => (
              <div key={label} className="flex items-center gap-2 text-[11px]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                <span className="text-slate-400">{label}</span>
                <span className="font-semibold text-slate-200">{fmt(val)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function AnalyticsPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [lastFetched, setLast] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchAnalytics()
      setData(result)
      setLast(new Date())
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load analytics.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const isAdmin = data?.scope === 'admin'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600&display=swap');
        .analytics-root { font-family: 'Outfit', sans-serif; }
        .font-display   { font-family: 'Bebas Neue', sans-serif; }
        .scrollbar-thin::-webkit-scrollbar { width: 3px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 9999px; }
      `}</style>

      <div className="analytics-root min-h-screen bg-[#060e1e] px-4 py-8 sm:px-8 text-white">
        {/* header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-1 w-6 rounded-full bg-cyan-500" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-500/70">
                {isAdmin ? 'Platform Analytics' : 'My Analytics'}
              </p>
            </div>
            <h1 className="font-display text-[2.2rem] leading-tight text-white" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {isAdmin ? 'ADMIN DASHBOARD' : 'YOUR INSIGHTS'}
            </h1>
            {lastFetched && (
              <p className="mt-1 text-[10px] text-slate-600">
                Updated {lastFetched.toLocaleTimeString()}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => downloadBlob('/admin/stats/export', 'analytics_export.csv')}
                className="flex items-center gap-2 rounded-xl border border-white/[0.07] px-4 py-2.5 text-[11px] font-medium text-slate-400 hover:border-cyan-500/30 hover:text-cyan-400 transition-all"
              >
                <Download size={13} />
                Export CSV
              </button>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 px-4 py-2.5 text-[11px] font-medium text-cyan-400 hover:bg-cyan-500/15 disabled:opacity-50 transition-all"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* scope badge */}
        {data && (
          <div className={`mb-6 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[10px] font-medium border
            ${isAdmin
              ? 'bg-violet-500/10 border-violet-500/20 text-violet-300'
              : 'bg-cyan-500/10   border-cyan-500/20   text-cyan-300'
            }`}>
            <Eye size={10} />
            {isAdmin ? 'Admin view — platform-wide data' : 'Personal view — your data only'}
          </div>
        )}

        {/* error */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/[0.07] px-4 py-3 text-sm text-rose-300">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        {/* content */}
        {loading && !data  ? <DashboardSkeleton /> :
         !data              ? null :
         isAdmin            ? <AdminDashboard data={data} /> :
                              <UserDashboard  data={data} />
        }
      </div>
    </>
  )
}