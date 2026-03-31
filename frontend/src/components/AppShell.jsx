import { Bell, Car, LoaderCircle, LogOut, Menu, ShieldCheck, X } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useAppContext } from '../context/AppContext'
import ScanDetailModal from './ScanDetailModal'

export default function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const {
    profile,
    notifications,
    logout,
    usage,
    scansRemainingPercent,
    isBootstrapping,
    message,
    error,
  } = useAppContext()

  const navItems = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/scans', label: 'Scans' },
    { to: '/analytics', label: 'Analytics' },
    { to: '/assistant', label: 'Assistant' },
    { to: '/reports', label: 'Reports' },
    { to: '/profile', label: 'Profile' },
    ...(profile?.plan === 'admin' ? [{ to: '/admin', label: 'Admin' }] : []),
  ]

  const unreadCount = notifications.filter((item) => !item.is_read).length

  return (
    <div className="relative min-h-screen bg-[#020712] text-slate-100">
      <div className="hero-gradient pointer-events-none absolute inset-0" />

      <header className="sticky top-0 z-40 border-b border-cyan-200/10 bg-[#020712]/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="rounded-lg border border-slate-700 p-2 text-slate-300 lg:hidden"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="flex items-center gap-2 rounded-xl border border-cyan-200/20 bg-slate-900/60 px-3 py-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-400/20 text-cyan-200">
                <Car size={16} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/80">Damage AI</p>
                <p className="text-sm font-semibold text-white">Control Surface</p>
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-900/40 p-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm transition ${
                    isActive ? 'bg-cyan-300/20 text-cyan-100' : 'text-slate-300 hover:bg-slate-800/80'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <NavLink
              to="/profile"
              className="relative rounded-lg border border-slate-700 p-2 text-slate-300 hover:text-cyan-200"
            >
              <Bell size={17} />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">
                  {unreadCount}
                </span>
              ) : null}
            </NavLink>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:text-rose-300"
            >
              <LogOut size={17} />
            </button>
            {profile?.plan === 'admin' ? (
              <NavLink
                to="/admin"
                className="rounded-lg border border-cyan-300/25 p-2 text-cyan-200 hover:bg-cyan-500/10"
              >
                <ShieldCheck size={17} />
              </NavLink>
            ) : null}
          </div>
        </div>
      </header>

      {mobileMenuOpen ? (
        <div
          className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <div className="mx-auto grid w-full max-w-[1500px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[250px_1fr] lg:px-8">
        <aside
          className={`fixed left-0 top-[68px] z-40 h-[calc(100vh-68px)] w-72 -translate-x-full border-r border-slate-700 bg-[#040a15] p-4 transition-transform lg:static lg:h-auto lg:w-auto lg:translate-x-0 lg:rounded-2xl lg:border lg:bg-slate-900/35 ${
            mobileMenuOpen ? 'translate-x-0' : ''
          }`}
        >
          <div className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition ${
                    isActive ? 'bg-cyan-300/20 text-cyan-100' : 'text-slate-300 hover:bg-slate-800/75'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-cyan-200/15 bg-cyan-500/5 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-200/80">Usage meter</p>
            <p className="mt-3 text-2xl font-semibold text-white">{usage?.scans_remaining ?? 0}</p>
            <p className="text-xs text-slate-400">scans remaining this month</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                style={{ width: `${100 - scansRemainingPercent}%` }}
              />
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          {isBootstrapping ? (
            <div className="panel-surface grid min-h-[60vh] place-items-center rounded-3xl">
              <div className="inline-flex items-center gap-2 text-slate-300">
                <LoaderCircle className="animate-spin" size={17} />
                Loading workspace...
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <ScanDetailModal />

      {error ? (
        <div className="fixed bottom-4 right-4 z-[60] inline-flex items-center gap-2 rounded-xl border border-rose-300/25 bg-rose-950/90 px-4 py-2 text-sm text-rose-200 shadow-lg shadow-rose-950/50">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="fixed bottom-4 right-4 z-[60] inline-flex items-center gap-2 rounded-xl border border-emerald-200/30 bg-emerald-950/90 px-4 py-2 text-sm text-emerald-100 shadow-lg shadow-emerald-950/40">
          {message}
        </div>
      ) : null}
    </div>
  )
}
