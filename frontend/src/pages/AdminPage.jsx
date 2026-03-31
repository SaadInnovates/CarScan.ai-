import { ShieldCheck, Trash2, Users, TrendingUp, Activity, BarChart3, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAppContext } from '../context/AppContext'
import AdminChatbotPanel from '../components/AdminChatbotPanel'

const SEV_COLORS = { low: '#22d3a6', medium: '#fb923c', high: '#fb7185', critical: '#ef4444' }
const SEV_CHIP = {
  low: 'rgba(34,211,166,.12) border-[rgba(34,211,166,.25)] text-emerald-300',
  medium: 'rgba(251,146,60,.12) border-[rgba(251,146,60,.25)] text-amber-300',
  high: 'rgba(251,113,133,.12) border-[rgba(251,113,133,.25)] text-rose-300',
  critical: 'rgba(239,68,68,.12) border-[rgba(239,68,68,.25)] text-red-300',
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'rgba(6,14,30,.95)', border: '1px solid rgba(6,182,212,.2)', borderRadius: '.75rem', padding: '.75rem 1rem', fontSize: '.75rem', color: '#fff' }}>
      <p style={{ color: 'rgba(100,116,139,.8)', marginBottom: '.25rem' }}>{label}</p>
      <p style={{ color: '#06b6d4', fontWeight: 600 }}>{payload[0].value} scans</p>
    </div>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');
.ap-root *{box-sizing:border-box}
.ap-root{font-family:'Space Grotesk',sans-serif}
.font-syne{font-family:'Syne',sans-serif}

@keyframes stageUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.stage-up{animation:stageUp .5s cubic-bezier(.16,1,.3,1) both}
.s1{animation-delay:.04s}.s2{animation-delay:.09s}.s3{animation-delay:.14s}.s4{animation-delay:.19s}

.panel-neo{
  background:linear-gradient(145deg,rgba(8,18,38,.97),rgba(5,12,26,.98));
  border:1px solid rgba(255,255,255,.07);border-radius:1.25rem;
}

/* Stat card glow on hover */
.stat-neo{
  background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);
  border-radius:1.25rem;transition:border-color .2s,background .2s,transform .15s;
}
.stat-neo:hover{border-color:rgba(6,182,212,.2);background:rgba(6,182,212,.04);transform:translateY(-2px)}

/* User row */
.user-row{
  background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);
  border-radius:.875rem;transition:border-color .2s,background .2s;
}
.user-row:hover{border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.035)}

/* Field input */
.field-inp{
  padding:.55rem .875rem;border-radius:.75rem;font-size:.8125rem;color:#fff;
  background:rgba(6,14,30,.9);border:1px solid rgba(255,255,255,.08);outline:none;
  transition:border-color .2s;font-family:'Space Grotesk',sans-serif;appearance:none;
}
.field-inp:focus{border-color:rgba(6,182,212,.35)}
.field-inp option{background:#0d1f3c}

/* Danger btn */
.btn-danger{
  display:inline-flex;align-items:center;gap:.4rem;padding:.45rem .875rem;border-radius:.75rem;
  font-size:.75rem;font-family:'Space Grotesk',sans-serif;
  background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);
  color:rgba(252,165,165,.9);transition:all .2s;cursor:pointer;
}
.btn-danger:hover:not(:disabled){background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.35)}
.btn-danger:disabled{opacity:.4;cursor:not-allowed}

/* Toggle btn */
.btn-toggle-act{display:inline-flex;align-items:center;gap:.4rem;padding:.45rem .875rem;border-radius:.75rem;font-size:.75rem;font-family:'Space Grotesk',sans-serif;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.18);color:rgba(252,165,165,.9);transition:all .2s;cursor:pointer}
.btn-toggle-act:hover{background:rgba(239,68,68,.13);border-color:rgba(239,68,68,.3)}
.btn-toggle-inact{display:inline-flex;align-items:center;gap:.4rem;padding:.45rem .875rem;border-radius:.75rem;font-size:.75rem;font-family:'Space Grotesk',sans-serif;background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.18);color:rgba(110,231,183,.9);transition:all .2s;cursor:pointer}
.btn-toggle-inact:hover{background:rgba(16,185,129,.12);border-color:rgba(16,185,129,.3)}

/* Status pill */
.pill-active{display:inline-flex;align-items:center;gap:.3rem;padding:.25rem .625rem;border-radius:9999px;font-size:.6875rem;font-weight:500;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.22);color:rgba(110,231,183,.9)}
.pill-inactive{display:inline-flex;align-items:center;gap:.3rem;padding:.25rem .625rem;border-radius:9999px;font-size:.6875rem;font-weight:500;background:rgba(51,65,85,.5);border:1px solid rgba(71,85,105,.4);color:rgba(148,163,184,.7)}

/* Sub req card */
.sub-card{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-radius:.875rem;transition:border-color .2s}
.sub-card:hover{border-color:rgba(6,182,212,.15)}

/* Approve/reject btns */
.btn-approve{display:inline-flex;align-items:center;gap:.4rem;padding:.4rem .875rem;border-radius:.75rem;font-size:.75rem;font-family:'Space Grotesk',sans-serif;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.22);color:rgba(110,231,183,.9);transition:all .2s;cursor:pointer}
.btn-approve:hover{background:rgba(16,185,129,.14);border-color:rgba(16,185,129,.35)}
.btn-reject{display:inline-flex;align-items:center;gap:.4rem;padding:.4rem .875rem;border-radius:.75rem;font-size:.75rem;font-family:'Space Grotesk',sans-serif;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:rgba(252,165,165,.9);transition:all .2s;cursor:pointer}
.btn-reject:hover{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.35)}

/* Filter tab */
.filter-tab{padding:.35rem .875rem;border-radius:.75rem;font-size:.75rem;cursor:pointer;transition:all .2s;border:1px solid rgba(255,255,255,.07);color:rgba(100,116,139,.9);font-family:'Space Grotesk',sans-serif}
.filter-tab:hover{border-color:rgba(255,255,255,.15);color:#fff}
.filter-tab-active{background:rgba(6,182,212,.1);border-color:rgba(6,182,212,.3);color:rgba(103,232,249,.9)}
`

export default function AdminPage() {
  const {
    profile, adminUsers, adminPlatformStats, adminActivity,
    adminUpdateUserPlan, adminToggleUserActive, adminDeleteUserAccount,
    adminHardDeleteScan, adminSubscriptionRequests,
    adminReviewSubscriptionRequest, refreshAdminSubscriptionRequests,
    toMediaUrl, formatDate,
  } = useAppContext()

  const [hardDeleteId, setHardDeleteId] = useState('')
  const [subscriptionFilter, setSubscriptionFilter] = useState('pending')

  const severityData = useMemo(() =>
    Object.entries(adminPlatformStats?.severity_breakdown || {}).map(([name, value]) => ({ name, value, fill: SEV_COLORS[name] || '#22d3a6' }))
  , [adminPlatformStats])

  useEffect(() => { refreshAdminSubscriptionRequests(subscriptionFilter) }, [refreshAdminSubscriptionRequests, subscriptionFilter])

  if (profile?.plan !== 'admin') return null

  const statCards = [
    { label: 'Total users', value: adminPlatformStats?.total_users ?? 0, color: 'text-white', icon: Users },
    { label: 'Pro users', value: adminPlatformStats?.pro_users ?? 0, color: 'text-cyan-300', icon: TrendingUp },
    { label: 'Total scans', value: adminPlatformStats?.total_scans ?? 0, color: 'text-white', icon: BarChart3 },
    { label: 'Inactive users', value: adminActivity?.inactive_users ?? 0, color: 'text-rose-300', icon: Activity },
  ]

  return (
    <>
      <style>{CSS}</style>
      <div className="ap-root space-y-5">

        {/* Hero */}
        <section className="stage-up s1 rounded-3xl p-6 sm:p-8 relative overflow-hidden" style={{ background: 'linear-gradient(130deg,rgba(8,30,58,.98),rgba(7,41,48,.96),rgba(8,14,30,.93))', border: '1px solid rgba(6,182,212,.1)' }}>
          <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 50% 80% at 0% 50%, rgba(6,182,212,.05), transparent)' }} />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-1 w-8 rounded-full" style={{ background: 'linear-gradient(90deg,#06b6d4,transparent)' }} />
                <p className="text-[10px] uppercase tracking-[.2em]" style={{ color: 'rgba(6,182,212,.65)' }}>Admin Console</p>
              </div>
              <h1 className="font-syne text-3xl text-white">Platform Operations</h1>
              <p className="mt-1.5 text-sm" style={{ color: 'rgba(148,163,184,.75)' }}>Manage user plans, account status, and platform-wide activity.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium" style={{ background: 'rgba(6,182,212,.09)', border: '1px solid rgba(6,182,212,.2)', color: 'rgba(103,232,249,.9)' }}>
              <ShieldCheck size={15} /> Admin Mode
            </div>
          </div>
        </section>

        {/* Stat cards */}
        <section className="stage-up s2 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map(({ label, value, color, icon: Icon }, i) => (
            <div key={label} className="stat-neo p-5" style={{ animationDelay: `${.1 + i * .05}s` }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-[.14em]" style={{ color: 'rgba(100,116,139,.8)' }}>{label}</p>
                <div className="flex h-7 w-7 items-center justify-center rounded-xl" style={{ background: 'rgba(6,182,212,.09)' }}>
                  <Icon size={13} style={{ color: '#06b6d4' }} />
                </div>
              </div>
              <p className={`text-3xl font-semibold font-syne ${color}`}>{value}</p>
            </div>
          ))}
        </section>

        {/* Charts */}
        <section className="stage-up s3 grid gap-4 xl:grid-cols-2">
          <div className="panel-neo p-5 sm:p-6">
            <h3 className="text-base font-semibold text-white mb-4">Scan activity — last {adminActivity?.days || 14} days</h3>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={adminActivity?.scans_per_day || []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'rgba(100,116,139,.8)', fontFamily: 'Space Grotesk' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgba(100,116,139,.8)', fontFamily: 'Space Grotesk' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(6,182,212,.04)' }} />
                  <Bar dataKey="count" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel-neo p-5 sm:p-6">
            <h3 className="text-base font-semibold text-white mb-3">Severity distribution</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {severityData.map(e => (
                <span key={`chip-${e.name}`} className="rounded-full border px-2.5 py-1 text-xs capitalize"
                  style={{ background: `${SEV_COLORS[e.name]}18`, borderColor: `${SEV_COLORS[e.name]}38`, color: SEV_COLORS[e.name] }}>
                  {e.name}: {e.value}
                </span>
              ))}
            </div>
            <div style={{ height: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severityData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgba(100,116,139,.8)', fontFamily: 'Space Grotesk' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgba(100,116,139,.8)', fontFamily: 'Space Grotesk' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,.02)' }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {severityData.map(e => <Cell key={e.name} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* User management */}
        <section className="stage-up s4 panel-neo p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-white">User management</h3>
            <div className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: 'rgba(148,163,184,.8)' }}>
              <Users size={12} /> {adminUsers.length} users
            </div>
          </div>

          <div className="space-y-2.5">
            {adminUsers.map(user => {
              const isProtected = (String(user.email || '').toLowerCase() === 'muhammadsaadzubair186@gmail.com' &&
                String(profile?.email || '').toLowerCase() !== 'muhammadsaadzubair186@gmail.com') || (user.id === profile?.id)
              return (
                <div key={user.id} className="user-row grid gap-3 p-3.5 lg:grid-cols-[1.4fr_auto_auto_auto_auto] lg:items-center">
                  <div>
                    <p className="text-sm font-medium text-white">{user.full_name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(100,116,139,.8)' }}>{user.email}</p>
                    {String(user.email || '').toLowerCase() === 'muhammadsaadzubair186@gmail.com' && (
                      <span className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[.1em]" style={{ background: 'rgba(251,191,36,.1)', border: '1px solid rgba(251,191,36,.25)', color: '#fde68a' }}>Protected admin</span>
                    )}
                    <p className="text-[10px] mt-1" style={{ color: 'rgba(71,85,105,.9)' }}>Joined {formatDate(user.created_at)} · Scans: {user.total_scans}</p>
                  </div>

                  <select value={user.plan} disabled={isProtected} onChange={e => adminUpdateUserPlan({ userId: user.id, plan: e.target.value })} className="field-inp h-9">
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="admin">Admin</option>
                  </select>

                  <button type="button" disabled={isProtected} onClick={() => adminToggleUserActive({ userId: user.id, active: !user.is_active })}
                    className={user.is_active ? 'btn-toggle-act' : 'btn-toggle-inact'}>
                    {user.is_active ? 'Deactivate' : 'Activate'}
                  </button>

                  <span className={user.is_active ? 'pill-active' : 'pill-inactive'}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: user.is_active ? '#10b981' : '#475569' }} />
                    {user.is_active ? 'active' : 'inactive'}
                  </span>

                  <button type="button" disabled={isProtected}
                    onClick={() => { if (window.confirm(`Delete account for ${user.email}?`)) adminDeleteUserAccount({ userId: user.id }) }}
                    className="btn-danger" title={isProtected ? 'Protected admin' : 'Delete account'}>
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              )
            })}
            {adminUsers.length === 0 && <p className="text-sm" style={{ color: 'rgba(71,85,105,.9)' }}>No users found.</p>}
          </div>
        </section>

        {/* Subscription requests */}
        <section className="panel-neo p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-white">Subscription requests</h3>
            <span className="text-xs rounded-xl px-2.5 py-1" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: 'rgba(148,163,184,.8)' }}>
              {adminSubscriptionRequests.length} {subscriptionFilter}
            </span>
          </div>

          <div className="mb-4 flex gap-2 flex-wrap">
            {['pending', 'approved', 'rejected'].map(s => (
              <button key={s} type="button" onClick={() => setSubscriptionFilter(s)}
                className={`filter-tab capitalize ${subscriptionFilter === s ? 'filter-tab-active' : ''}`}>{s}</button>
            ))}
          </div>

          <div className="space-y-3">
            {adminSubscriptionRequests.map(req => (
              <div key={req.id} className="sub-card p-4">
                <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
                  <div>
                    <p className="text-sm font-medium text-white">{req.user_full_name} <span style={{ color: 'rgba(100,116,139,.8)' }}>({req.user_email})</span></p>
                    <p className="mt-1.5 text-xs" style={{ color: 'rgba(100,116,139,.8)' }}>
                      Method: <span className="capitalize text-white">{req.payment_method}</span> · Number: {req.payment_number}
                    </p>
                    <p className="mt-1 text-[10px]" style={{ color: 'rgba(71,85,105,.9)' }}>Submitted {formatDate(req.created_at)}</p>
                    <p className="mt-1 text-[10px]" style={{ color: 'rgba(71,85,105,.9)' }}>Status: <span className="capitalize" style={{ color: 'rgba(203,213,225,.8)' }}>{req.status}</span></p>
                    {req.admin_note && <p className="mt-1 text-xs" style={{ color: '#fde68a' }}>Note: {req.admin_note}</p>}
                    {req.status === 'pending' && (
                      <div className="mt-3 flex gap-2">
                        <button type="button" className="btn-approve" onClick={() => adminReviewSubscriptionRequest({ requestId: req.id, action: 'approve', status: subscriptionFilter })}>Approve Pro</button>
                        <button type="button" className="btn-reject" onClick={() => adminReviewSubscriptionRequest({ requestId: req.id, action: 'reject', status: subscriptionFilter })}>Reject</button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <a href={toMediaUrl(req.receipt_path)} target="_blank" rel="noreferrer"
                      className="block overflow-hidden rounded-xl transition-transform hover:scale-[1.03]"
                      style={{ border: '1px solid rgba(6,182,212,.15)', background: 'rgba(2,8,20,.8)' }}>
                      <img src={toMediaUrl(req.receipt_path)} alt="receipt" className="h-36 w-52 object-contain" style={{ borderRadius: '.75rem', background: '#0d1f3c' }} />
                    </a>
                    <a href={toMediaUrl(req.receipt_path)} download
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-colors"
                      style={{ background: 'rgba(6,182,212,.08)', border: '1px solid rgba(6,182,212,.2)', color: 'rgba(103,232,249,.9)' }}>
                      Download receipt
                    </a>
                  </div>
                </div>
              </div>
            ))}
            {adminSubscriptionRequests.length === 0 && (
              <p className="text-sm" style={{ color: 'rgba(71,85,105,.9)' }}>No {subscriptionFilter} requests.</p>
            )}
          </div>
        </section>

        {/* Hard delete */}
        <section className="panel-neo p-5 sm:p-6">
          <h3 className="text-base font-semibold text-white mb-1">Hard delete scan</h3>
          <p className="text-xs mb-4" style={{ color: 'rgba(100,116,139,.8)' }}>Permanent removal from database. Use with caution.</p>
          <div className="flex flex-wrap gap-3">
            <input value={hardDeleteId} onChange={e => setHardDeleteId(e.target.value)} placeholder="Enter scan ID"
              className="field-inp" style={{ maxWidth: 220 }} />
            <button type="button" className="btn-danger"
              onClick={() => { const id = Number(hardDeleteId); if (!Number.isFinite(id) || id <= 0) return; adminHardDeleteScan(id); setHardDeleteId('') }}>
              <Trash2 size={13} /> Delete scan
            </button>
          </div>
        </section>

        <AdminChatbotPanel />
      </div>
    </>
  )
}