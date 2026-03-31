import { createElement } from 'react'
import { Activity, Bell, Car, Gauge, HeartPulse, Shield, Sparkles, TriangleAlert } from 'lucide-react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { useAppContext } from '../context/AppContext'
import { getDamageChipStyle } from '../lib/damageColors'

const severityColors = {
  low: '#22D3A6',
  medium: '#FB923C',
  high: '#FB7185',
  critical: '#EF4444',
}

const severityTone = {
  low: 'text-emerald-300 bg-emerald-400/10 border-emerald-300/30',
  medium: 'text-amber-300 bg-amber-400/10 border-amber-300/30',
  high: 'text-rose-300 bg-rose-400/10 border-rose-300/30',
  critical: 'text-red-300 bg-red-400/10 border-red-300/30',
}

function StatCard({ title, value, hint, icon }) {
  const iconNode = icon ? createElement(icon, { size: 16 }) : null

  return (
    <div className="panel-surface rounded-2xl p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{title}</p>
        <span className="rounded-lg bg-slate-900/70 p-2 text-cyan-300">{iconNode}</span>
      </div>
      <p className="text-2xl font-semibold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  )
}

export default function DashboardPage() {
  const {
    profile,
    usage,
    stats,
    insights,
    health,
    notifications,
    scansData,
    scansRemainingPercent,
    openScanDetail,
    toMediaUrl,
    formatDate,
  } = useAppContext()

  const severityChartData = Object.entries(stats?.severity_breakdown || {}).map(([name, value]) => ({
    name,
    value,
    color: severityColors[name] || '#22D3A6',
  }))

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-cyan-200/15 bg-[linear-gradient(130deg,rgba(6,20,46,.98),rgba(8,46,67,.92),rgba(6,16,28,.9))] p-5 sm:p-6 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/65">Command Center</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-white sm:text-4xl">
              Damage Insights, {profile?.full_name || 'Operator'}
            </h1>
            <p className="mt-3 max-w-xl text-sm text-slate-300">
              Track scan quota, monitor severity trends, and generate reports directly from your dashboard.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <span className="rounded-full border border-cyan-200/20 bg-slate-950/40 px-3 py-1.5">
                Plan: {(usage?.plan || 'free').toUpperCase()}
              </span>
              <span className="rounded-full border border-cyan-200/20 bg-slate-950/40 px-3 py-1.5">
                Reset: {usage?.reset_date || '-'}
              </span>
            </div>
          </div>

          <div className="panel-surface rounded-2xl p-4">
            <p className="text-sm text-slate-300">Monthly usage</p>
            <div className="mt-3 flex items-end justify-between gap-2">
              <p className="text-3xl font-semibold text-cyan-200">
                {usage?.scans_this_month ?? 0}
                <span className="text-base text-slate-400">/{usage?.scan_limit ?? 0}</span>
              </p>
              <p className="text-sm text-slate-400">{scansRemainingPercent}% used</p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400"
                style={{ width: `${scansRemainingPercent}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total scans" value={stats?.total_scans ?? 0} hint="All-time processed scans" icon={Gauge} />
        <StatCard title="Avg confidence" value={stats?.avg_confidence ?? 0} hint="Average detection confidence" icon={Shield} />
        <StatCard title="Remaining quota" value={usage?.scans_remaining ?? 0} hint="Scans left this month" icon={Activity} />
        <StatCard
          title="Notifications"
          value={notifications.filter((item) => !item.is_read).length}
          hint="Unread alerts"
          icon={Bell}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr_1fr]">
        <div className="panel-surface rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-200">System health</h3>
            <HeartPulse size={16} className="text-cyan-300" />
          </div>
          <div className="space-y-2 text-sm text-slate-300">
            <p>Status: <span className="font-medium text-emerald-300">{health?.status || 'unknown'}</span></p>
            <p>Backend version: <span className="text-slate-100">{health?.version || '-'}</span></p>
            <p>Model loaded: <span className={health?.model_loaded ? 'text-emerald-300' : 'text-rose-300'}>{String(health?.model_loaded ?? false)}</span></p>
            <p>DB connected: <span className={health?.db_connected ? 'text-emerald-300' : 'text-rose-300'}>{String(health?.db_connected ?? false)}</span></p>
          </div>
        </div>

        <div className="panel-surface rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-200">Risk score</h3>
            <TriangleAlert size={16} className="text-amber-300" />
          </div>
          <p className="text-4xl font-semibold text-white">{insights?.risk_score ?? 0}</p>
          <p className="mt-1 text-xs text-slate-400">higher means more severe recent detections</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-500"
              style={{ width: `${Math.min(100, insights?.risk_score ?? 0)}%` }}
            />
          </div>
        </div>

        <div className="panel-surface rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-200">AI recommendations</h3>
            <Sparkles size={16} className="text-cyan-300" />
          </div>
          <ul className="space-y-2 text-sm text-slate-300">
            {(insights?.recommended_actions || []).slice(0, 3).map((item, idx) => (
              <li key={`${item}-${idx}`} className="rounded-lg border border-slate-700/80 bg-slate-900/55 px-3 py-2">
                {item}
              </li>
            ))}
            {(insights?.recommended_actions || []).length === 0 ? (
              <li className="text-xs text-slate-400">No recommendations yet.</li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="panel-surface rounded-2xl p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-medium text-white">Recent scans</h3>
          </div>

          <div className="space-y-3">
            {scansData.items.slice(0, 4).map((scan) => (
              <button
                key={scan.id}
                type="button"
                onClick={() => openScanDetail(scan.id)}
                className="group flex w-full items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 text-left transition hover:border-cyan-200/30"
              >
                <div className="h-14 w-14 overflow-hidden rounded-lg border border-slate-700/70 bg-slate-950/70">
                  {scan.thumbnail_path ? (
                    <img src={toMediaUrl(scan.thumbnail_path)} alt="thumbnail" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-slate-500">
                      <Car size={18} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{scan.original_filename}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDate(scan.created_at)}</p>
                  {scan.damage_labels ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {String(scan.damage_labels)
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((label) => (
                          <span
                            key={`${scan.id}-${label}`}
                            style={getDamageChipStyle({ label, category: '' })}
                            className="rounded-full border px-2 py-0.5 text-[10px]"
                          >
                            {label}
                          </span>
                        ))}
                    </div>
                  ) : null}
                </div>
                <span className={`rounded-full border px-2 py-1 text-xs capitalize ${severityTone[scan.severity] || severityTone.low}`}>
                  {scan.severity}
                </span>
              </button>
            ))}
            {scansData.items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-400">
                No scans yet. Upload your first file from the Scans tab.
              </p>
            ) : null}
          </div>
        </div>

        <div className="panel-surface rounded-2xl p-4 sm:p-5">
          <h3 className="text-lg font-medium text-white">Severity split</h3>
          <div className="mt-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={severityChartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={84} paddingAngle={4}>
                  {severityChartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="panel-surface rounded-2xl p-4 sm:p-5">
        <h3 className="text-lg font-medium text-white">7-day scan activity</h3>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {(insights?.daily_scans || []).map((entry) => {
            const maxCount = Math.max(...(insights?.daily_scans || []).map((d) => d.count), 1)
            const heightPercent = Math.max(8, Math.round((entry.count / maxCount) * 100))

            return (
              <div key={entry.day} className="rounded-lg border border-slate-700/70 bg-slate-900/55 p-2 text-center">
                <div className="mx-auto flex h-20 items-end justify-center">
                  <div
                    className="w-4 rounded bg-gradient-to-t from-cyan-500 to-emerald-400"
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">{entry.day.slice(5)}</p>
                <p className="text-xs font-medium text-slate-100">{entry.count}</p>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
