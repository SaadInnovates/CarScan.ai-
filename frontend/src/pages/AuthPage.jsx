import { Eye, EyeOff, LoaderCircle, MailCheck, ArrowRight, ShieldCheck, Zap, FileText, ScanLine } from 'lucide-react'
import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'

/* ─────────────────────────────────────────────────────────
   ParticleMesh — constant speed, batched strokes, lightweight
   • No delta-time: each node moves exactly SPEED px/frame
   • Nodes initialised with a random angle so all move at
     the same magnitude — zero variation in pace
   • Lines batched into alpha buckets: only 6 strokeStyle
     changes per frame instead of one per segment
   • All nodes drawn in a single beginPath/fill pass
   • Squared-distance check avoids sqrt until needed
─────────────────────────────────────────────────────────── */
function ParticleMesh() {
  const ref = useRef(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    let id, alive = true

    // ── tuneable ──────────────────────────
    const COUNT    = 60    // node count — lower = cheaper
    const MAX_DIST = 140   // connection threshold (px)
    const SPEED    = 0.5   // px per frame — raise/lower freely
    const BUCKETS  = 6     // alpha quantisation levels
    // ─────────────────────────────────────

    const resize = () => {
      cv.width  = cv.offsetWidth
      cv.height = cv.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Each node gets a random angle so vx²+vy² == SPEED² always
    const nodes = Array.from({ length: COUNT }, () => {
      const a = Math.random() * Math.PI * 2
      return {
        x:  Math.random() * cv.width,
        y:  Math.random() * cv.height,
        vx: Math.cos(a) * SPEED,
        vy: Math.sin(a) * SPEED,
        r:  Math.random() * 1.4 + 0.5,
      }
    })

    // Reusable bucket arrays — allocated once, cleared each frame
    const buckets = Array.from({ length: BUCKETS }, () => [])
    const MAX_SQ  = MAX_DIST * MAX_DIST

    const draw = () => {
      if (!alive) return
      const { width: W, height: H } = cv
      ctx.clearRect(0, 0, W, H)

      // ── 1. move — pure constant velocity, no dt ──
      for (let i = 0; i < COUNT; i++) {
        const n = nodes[i]
        n.x += n.vx
        n.y += n.vy
        // hard-edge bounce keeps speed magnitude perfectly constant
        if (n.x <= 0)  { n.x = 0; n.vx =  Math.abs(n.vx) }
        if (n.x >= W)  { n.x = W; n.vx = -Math.abs(n.vx) }
        if (n.y <= 0)  { n.y = 0; n.vy =  Math.abs(n.vy) }
        if (n.y >= H)  { n.y = H; n.vy = -Math.abs(n.vy) }
      }

      // ── 2. bucket pairs by proximity ──
      for (let b = 0; b < BUCKETS; b++) buckets[b].length = 0

      for (let i = 0; i < COUNT; i++) {
        const ax = nodes[i].x, ay = nodes[i].y
        for (let j = i + 1; j < COUNT; j++) {
          const dx = ax - nodes[j].x
          const dy = ay - nodes[j].y
          const sq = dx * dx + dy * dy
          if (sq < MAX_SQ) {
            // ratio 1 = touching, 0 = at MAX_DIST
            const ratio = 1 - Math.sqrt(sq) / MAX_DIST
            const b     = Math.min(BUCKETS - 1, (ratio * BUCKETS) | 0)
            const bk    = buckets[b]
            bk.push(ax, ay, nodes[j].x, nodes[j].y)
          }
        }
      }

      // ── 3. draw lines — one stroke() per bucket ──
      ctx.lineWidth = 0.7
      for (let b = 0; b < BUCKETS; b++) {
        const bk = buckets[b]
        if (!bk.length) continue
        // bucket 0 = faintest (far), BUCKETS-1 = strongest (close)
        const alpha = 0.04 + (b / (BUCKETS - 1)) * 0.14
        ctx.strokeStyle = `rgba(56,189,248,${alpha.toFixed(2)})`
        ctx.beginPath()
        for (let k = 0; k < bk.length; k += 4) {
          ctx.moveTo(bk[k],     bk[k + 1])
          ctx.lineTo(bk[k + 2], bk[k + 3])
        }
        ctx.stroke()
      }

      // ── 4. draw all nodes in one fill pass ──
      ctx.fillStyle = 'rgba(56,189,248,0.55)'
      ctx.beginPath()
      for (let i = 0; i < COUNT; i++) {
        const n = nodes[i]
        ctx.moveTo(n.x + n.r, n.y)
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
      }
      ctx.fill()

      id = requestAnimationFrame(draw)
    }

    id = requestAnimationFrame(draw)
    return () => {
      alive = false
      cancelAnimationFrame(id)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />
}

/* ─────────────────────────────────────
   Grid dot pattern SVG overlay
───────────────────────────────────── */
function DotGrid() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-[0.035]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" fill="#94a3b8" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" />
    </svg>
  )
}

/* ─────────────────────────────────────
   Scan corner brackets
───────────────────────────────────── */
function ScanFrame({ className = '' }) {
  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`}>
      {[
        'top-0 left-0 border-t border-l',
        'top-0 right-0 border-t border-r',
        'bottom-0 left-0 border-b border-l',
        'bottom-0 right-0 border-b border-r',
      ].map((cls, i) => (
        <span key={i} className={`absolute ${cls} h-5 w-5 border-cyan-400/60`} />
      ))}
    </div>
  )
}

/* ─────────────────────────────────────
   Stat card
───────────────────────────────────── */
function StatCard({ val, label, delay }) {
  return (
    <div className="stat-card relative flex flex-col items-center rounded-2xl border border-white/[0.06] p-4 text-center"
      style={{ animationDelay: delay }}>
      <span className="font-display text-2xl text-white">{val}</span>
      <span className="mt-1 text-[10px] uppercase tracking-widest text-slate-500">{label}</span>
    </div>
  )
}

/* ─────────────────────────────────────
   Feature badge
───────────────────────────────────── */
function Badge({ icon, children }) {
  return (
    <div className="badge inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-medium text-slate-300">
      {icon ? createElement(icon, { size: 11, className: 'text-cyan-400 shrink-0' }) : null}
      {children}
    </div>
  )
}

/* ─────────────────────────────────────
   Field wrapper
───────────────────────────────────── */
function Field({ label, children }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      {children}
    </div>
  )
}

const inputCls = [
  'w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600',
  'bg-[#0b1628] border border-white/[0.07]',
  'outline-none transition-all duration-200',
  'focus:border-cyan-500/50 focus:shadow-[0_0_0_3px_rgba(6,182,212,0.08)]',
].join(' ')

/* ═══════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════ */
export default function AuthPage() {
  const {
    token, setToken, showMessage,
    login, register, loadingKey,
    resendVerification,
  } = useAppContext()

  const [authMode, setAuthMode]     = useState('login')
  const [form, setForm]             = useState({ full_name: '', email: '', password: '' })
  const [showPw, setShowPw]         = useState(false)
  const [pendingEmail, setPending]  = useState('')
  const [hint, setHint]             = useState('')
  const [authError, setAuthError]   = useState('')

  const googleAuth = { enabled: true, auth_url: '/api/v1/auth/google/login' }
  const oauthErr   = new URLSearchParams(window.location.search).get('oauth_error') || ''

  const canResend = useMemo(
    () => Boolean((pendingEmail || form.email || '').trim()),
    [pendingEmail, form.email],
  )

  const onChange = (e) => {
    const { name, value } = e.target
    setForm(p => ({ ...p, [name]: value }))
    if (authError) setAuthError('')
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (authMode === 'login') {
      try {
        await login({ email: form.email, password: form.password })
      } catch (err) {
        const d = err?.response?.data?.detail
        if (d?.code === 'EMAIL_NOT_VERIFIED' || d?.requires_verification) {
          const em = d?.email || form.email
          setPending(em)
          setHint(`Account not verified. Resend verification below for ${em}.`)
          setAuthError('')
          return
        }
        const msg = typeof d === 'string' ? d : d?.message || ''
        if (!err?.response)                   setAuthError('Cannot reach the server. Is the backend running?')
        else if (err.response.status === 401) setAuthError(msg || 'Incorrect email or password.')
        else                                  setAuthError(msg || 'Login failed. Please try again.')
      }
      return
    }
    try {
      const r = await register({ full_name: form.full_name, email: form.email, password: form.password })
      setPending(form.email)
      setHint(r?.detail || 'Account created! Check your email to verify.')
      setAuthError('')
      setAuthMode('login')
      setForm(p => ({ ...p, password: '' }))
    } catch (err) {
      const d = err?.response?.data?.detail
      const msg = typeof d === 'string' ? d : d?.message || ''
      if (!err?.response) setAuthError('Cannot reach the server. Is the backend running?')
      else                setAuthError(msg || 'Registration failed. Please try again.')
    }
  }

  const resendEmail = async () => {
    const email = (pendingEmail || form.email || '').trim()
    if (!email) return
    const r = await resendVerification(email)
    setHint(r?.detail || `Verification sent to ${email}.`)
  }

  const dismissOauth = () => {
    const p = new URLSearchParams(window.location.search)
    p.delete('oauth_error')
    const q = p.toString()
    window.history.replaceState({}, '', q ? `${window.location.pathname}?${q}` : window.location.pathname)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const tok = p.get('oauth_token'), err = p.get('oauth_error')
    if (tok) { setToken(tok); showMessage('Signed in with Google.') }
    if (err) showMessage(err)
    if (!tok && !err) return
    p.delete('oauth_token')
    const q = p.toString()
    window.history.replaceState({}, '', q ? `${window.location.pathname}?${q}` : window.location.pathname)
  }, [setToken, showMessage])

  if (token) return <Navigate to="/dashboard" replace />

  const isLogin = authMode === 'login'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600&display=swap');

        .auth-wrap  { font-family: 'Outfit', sans-serif; background: #060e1e; }
        .font-display { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.04em; }

        @keyframes riseIn {
          from { opacity:0; transform: translateY(20px) scale(0.985); }
          to   { opacity:1; transform: translateY(0)    scale(1); }
        }
        .rise   { animation: riseIn 0.7s cubic-bezier(.22,1,.36,1) both; }
        .rise-1 { animation-delay:.08s }
        .rise-2 { animation-delay:.16s }
        .rise-3 { animation-delay:.24s }
        .rise-4 { animation-delay:.32s }
        .rise-5 { animation-delay:.40s }

        @keyframes titleGlow {
          0%,100% { text-shadow: 0 0 40px rgba(6,182,212,0.22); }
          50%      { text-shadow: 0 0 70px rgba(6,182,212,0.45), 0 0 120px rgba(6,182,212,0.18); }
        }
        .glow-title { animation: titleGlow 4s ease-in-out infinite; color: #fff; }

        @keyframes beamMove {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .beam-line::after {
          content:'';
          position:absolute;
          inset:0;
          background: linear-gradient(90deg, transparent, rgba(6,182,212,0.65), transparent);
          width:25%;
          animation: beamMove 3.5s ease-in-out infinite;
        }

        .form-glass {
          background: linear-gradient(145deg, rgba(11,22,40,0.92), rgba(6,14,30,0.96));
          backdrop-filter: blur(32px);
          -webkit-backdrop-filter: blur(32px);
          border: 1px solid rgba(255,255,255,0.07);
          box-shadow:
            0 0 0 1px rgba(6,182,212,0.06) inset,
            0 32px 80px -24px rgba(0,0,0,0.7),
            0 0 60px -20px rgba(6,182,212,0.09);
        }

        .g-btn {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.10);
          transition: all 0.22s ease;
          position: relative;
          overflow: hidden;
        }
        .g-btn::before {
          content:'';
          position:absolute; inset:0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
          transform: translateX(-100%);
          transition: transform 0.5s ease;
        }
        .g-btn:hover:not(:disabled)::before { transform: translateX(100%); }
        .g-btn:hover:not(:disabled) {
          border-color: rgba(255,255,255,0.20);
          background: rgba(255,255,255,0.07);
          transform: translateY(-1px);
          box-shadow: 0 8px 24px -8px rgba(0,0,0,0.4);
        }
        .g-btn:active:not(:disabled) { transform: translateY(0); }

        .cta-btn {
          background: linear-gradient(125deg, #0891b2 0%, #06b6d4 45%, #0e7490 100%);
          box-shadow: 0 4px 28px -6px rgba(6,182,212,0.55), 0 0 0 1px rgba(6,182,212,0.15) inset;
          transition: all 0.22s ease;
          position: relative;
          overflow: hidden;
        }
        .cta-btn::before {
          content:'';
          position:absolute;
          top:-50%; left:-60%;
          width:40%; height:200%;
          background: rgba(255,255,255,0.15);
          transform: rotate(25deg);
          transition: left 0.5s ease;
        }
        .cta-btn:hover:not(:disabled)::before { left:130%; }
        .cta-btn:hover:not(:disabled) {
          box-shadow: 0 8px 36px -6px rgba(6,182,212,0.75), 0 0 0 1px rgba(6,182,212,0.25) inset;
          transform: translateY(-1px);
        }
        .cta-btn:active:not(:disabled) { transform: translateY(0); }

        .switch-btn {
          border: 1px solid rgba(255,255,255,0.06);
          transition: all 0.2s ease;
        }
        .switch-btn:hover {
          border-color: rgba(6,182,212,0.28);
          background: rgba(6,182,212,0.05);
        }

        .badge {
          background: rgba(6,182,212,0.07);
          border: 1px solid rgba(6,182,212,0.15);
          transition: all 0.2s;
        }

        .stat-card {
          background: rgba(255,255,255,0.025);
          transition: background 0.2s, border-color 0.2s;
          animation: riseIn 0.7s cubic-bezier(.22,1,.36,1) both;
        }
        .stat-card:hover {
          background: rgba(6,182,212,0.05);
          border-color: rgba(6,182,212,0.18);
        }

        @keyframes spinSlow { to { transform: rotate(360deg); } }
        .spin-ring  { animation: spinSlow 18s linear infinite; }
        .spin-ring2 { animation: spinSlow 12s linear infinite reverse; }

        .resend-btn {
          border: 1px solid rgba(251,191,36,0.15);
          transition: all 0.2s;
        }
        .resend-btn:hover:not(:disabled) {
          border-color: rgba(251,191,36,0.35);
          background: rgba(251,191,36,0.06);
        }

        @keyframes logoPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(6,182,212,0.4); }
          60%      { box-shadow: 0 0 0 10px rgba(6,182,212,0); }
        }
        .logo-pulse { animation: logoPulse 2.8s ease-in-out infinite; }
      `}</style>

      <div className="auth-wrap relative min-h-screen overflow-hidden">

        {/* ── layered backgrounds ── */}
        <div className="pointer-events-none absolute inset-0">
          <ParticleMesh />
          <DotGrid />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_100%,rgba(0,0,0,0.55),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_30%_at_50%_0%,rgba(6,182,212,0.06),transparent)]" />
        </div>

        <div className="relative z-10 flex min-h-screen">

          {/* ══════════════════════════
              LEFT — brand panel
          ══════════════════════════ */}
          <div className="relative hidden flex-col overflow-hidden border-r border-white/[0.05] lg:flex lg:w-[54%]">

            {/* decorative rings */}
            <div className="pointer-events-none absolute right-[-130px] top-[12%] opacity-[0.08]">
              <div className="spin-ring h-[480px] w-[480px] rounded-full border border-cyan-400/50" />
            </div>
            <div className="pointer-events-none absolute right-[-70px] top-[20%] opacity-[0.05]">
              <div className="spin-ring2 h-[340px] w-[340px] rounded-full border border-cyan-300/60" />
            </div>

            <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">

              {/* logo */}
              <div className="rise flex items-center gap-3">
                <div className="logo-pulse flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-teal-500 shadow-lg shadow-cyan-500/30">
                  <ScanLine size={22} className="text-white" />
                </div>
                <div>
                  <span className="font-display text-2xl text-white tracking-wide">CARSCAN</span>
                  <span className="font-display text-2xl text-cyan-400"> AI</span>
                </div>
              </div>

              {/* hero text */}
              <div className="rise rise-1">
                <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-400/70">
                  ◆ &nbsp;Precision Damage Intelligence
                </p>

                <h1 className="font-display glow-title text-[clamp(3.2rem,5.5vw,5.2rem)] leading-[0.9]">
                  DETECT.<br />
                  <span className="text-cyan-400">ANALYZE.</span><br />
                  REPORT.
                </h1>

                <p className="mt-7 max-w-[340px] text-sm leading-relaxed text-slate-400">
                  AI-powered vehicle inspection that catches every dent and scratch —
                  generating insurance-ready reports in under 5 seconds.
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                  <Badge icon={Zap}>Real-time AI detection</Badge>
                  <Badge icon={FileText}>Insurance-ready PDF</Badge>
                  <Badge icon={ShieldCheck}>End-to-end encrypted</Badge>
                </div>
              </div>

              {/* stats */}
              <div className="rise rise-2">
                <div className="grid grid-cols-3 gap-3">
                  <StatCard val=">90%" label="Accuracy"     delay="0.5s" />
                  <StatCard val="Fast"   label="Scan time"    delay="0.58s" />
                  <StatCard val="10+"   label="Damage types" delay="0.66s" />
                </div>
                <p className="mt-5 text-[10px] text-slate-700">
                  Trusted by automotive inspectors &amp; insurance adjusters worldwide.
                </p>
              </div>
            </div>
          </div>

          {/* ══════════════════════════
              RIGHT — form panel
          ══════════════════════════ */}
          <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-10">
            <div className="w-full max-w-[420px]">

              {/* mobile logo */}
              <div className="mb-8 flex items-center gap-2.5 lg:hidden rise">
                <div className="logo-pulse flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-teal-500">
                  <ScanLine size={18} className="text-white" />
                </div>
                <span className="font-display text-xl text-white">CARSCAN <span className="text-cyan-400">AI</span></span>
              </div>

              {/* heading */}
              <div className="rise mb-7">
                <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-cyan-500/70">
                  {isLogin ? '⬡  Returning user' : '⬡  New user'}
                </p>
                <h2 className="font-display mt-2 text-[2rem] leading-tight text-white whitespace-pre-line">
                  {isLogin ? 'SIGN IN TO YOUR\nWORKSPACE' : 'CREATE YOUR\nACCOUNT'}
                </h2>
              </div>

              {/* glass card */}
              <div className="form-glass rise rise-1 rounded-3xl p-7">

                {/* Google OAuth */}
                <button
                  type="button"
                  onClick={() => googleAuth.enabled && googleAuth.auth_url && (window.location.href = googleAuth.auth_url)}
                  disabled={!googleAuth.enabled}
                  className="g-btn mb-5 flex w-full items-center justify-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-medium text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9086c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9086-2.2581c-.8063.54-1.8368.859-3.0477.859-2.3441 0-4.3282-1.5836-5.036-3.7104H.957v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853"/>
                    <path d="M3.964 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.957A8.9965 8.9965 0 0 0 0 9c0 1.4514.3477 2.8255.957 4.0418L3.964 10.71z" fill="#FBBC05"/>
                    <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.957 4.9582L3.964 7.29C4.6718 5.1632 6.6559 3.5795 9 3.5795z" fill="#EA4335"/>
                  </svg>
                  {googleAuth.enabled ? 'Continue with Google' : 'Google sign-in (coming soon)'}
                </button>

                {/* oauth error */}
                {oauthErr && (
                  <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
                    <span>Google sign-in failed: {oauthErr}</span>
                    <button type="button" onClick={dismissOauth}
                      className="shrink-0 rounded-lg border border-rose-400/25 px-2 py-0.5 text-[10px] hover:bg-rose-500/20">✕</button>
                  </div>
                )}

                {/* auth error */}
                {authError && (
                  <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
                    {authError}
                  </div>
                )}

                {/* divider */}
                <div className="relative mb-5 flex items-center gap-3 overflow-hidden">
                  <div className="beam-line relative h-px flex-1 overflow-hidden bg-white/[0.06]" />
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-widest text-slate-600">or email</span>
                  <div className="beam-line relative h-px flex-1 overflow-hidden bg-white/[0.06]" />
                </div>

                {/* form */}
                <form onSubmit={onSubmit} className="space-y-4">

                  {!isLogin && (
                    <div className="rise rise-2">
                      <Field label="Full name">
                        <div className="relative">
                          <ScanFrame className="rounded-xl opacity-0 transition-opacity duration-300 focus-within:opacity-100" />
                          <input name="full_name" value={form.full_name} onChange={onChange} required
                            className={inputCls} placeholder="Saad Zubair" autoComplete="name" />
                        </div>
                      </Field>
                    </div>
                  )}

                  <div className={`rise ${isLogin ? 'rise-2' : 'rise-3'}`}>
                    <Field label="Email address">
                      <input name="email" type="email" value={form.email} onChange={onChange} required
                        className={inputCls} placeholder="you@example.com" autoComplete="email" />
                    </Field>
                  </div>

                  <div className={`rise ${isLogin ? 'rise-3' : 'rise-4'}`}>
                    <Field label="Password">
                      <div className="relative">
                        <input name="password" type={showPw ? 'text' : 'password'} value={form.password}
                          onChange={onChange} required className={`${inputCls} pr-12`}
                          placeholder={isLogin ? 'Your password' : 'At least 6 characters'}
                          autoComplete={isLogin ? 'current-password' : 'new-password'} />
                        <button type="button" onClick={() => setShowPw(p => !p)}
                          aria-label={showPw ? 'Hide password' : 'Show password'}
                          className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-600 hover:text-cyan-400 transition-colors">
                          {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </Field>
                  </div>

                  <div className={`rise ${isLogin ? 'rise-4' : 'rise-5'} pt-1`}>
                    <button type="submit" disabled={loadingKey === 'auth'}
                      className="cta-btn flex w-full items-center justify-center gap-2.5 rounded-2xl px-4 py-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55">
                      {loadingKey === 'auth'
                        ? <><LoaderCircle size={15} className="animate-spin" /> Processing…</>
                        : <>{isLogin ? 'Sign in' : 'Create account'} </>
                      }
                    </button>
                  </div>
                </form>

                {/* verification */}
                {isLogin && (
                  <div className="mt-4 space-y-3">
                    {hint && (
                      <div className="flex items-start gap-2.5 rounded-2xl border border-amber-400/20 bg-amber-500/[0.07] px-4 py-3 text-xs text-amber-200">
                        <MailCheck size={13} className="mt-0.5 shrink-0 text-amber-400" />
                        <span>{hint}</span>
                      </div>
                    )}
                    <button type="button" onClick={resendEmail}
                      disabled={loadingKey === 'resend-verification' || !canResend}
                      className="resend-btn w-full rounded-2xl px-4 py-2.5 text-xs font-medium text-amber-200/70 disabled:cursor-not-allowed disabled:opacity-40">
                      {loadingKey === 'resend-verification' ? 'Sending…' : 'Resend verification email'}
                    </button>
                  </div>
                )}
              </div>

              {/* mode toggle */}
              <button type="button"
                onClick={() => {
                  setAuthMode(isLogin ? 'register' : 'login')
                  setHint(''); setPending(''); setAuthError('')
                }}
                className="switch-btn rise rise-5 mt-4 w-full rounded-2xl px-4 py-3.5 text-sm text-slate-500 transition hover:text-slate-300">
                {isLogin ? "Don't have an account? " : 'Already have an account? '}
                <span className="font-semibold text-cyan-400">
                  {isLogin ? 'Register free ' : 'Sign in '}
                </span>
              </button>

              <p className="mt-4 text-center text-[10px] text-slate-700">
                By continuing you agree to our{' '}
                <span className="cursor-pointer text-slate-600 hover:text-slate-400 underline underline-offset-2">Terms</span>
                {' '}&amp;{' '}
                <span className="cursor-pointer text-slate-600 hover:text-slate-400 underline underline-offset-2">Privacy Policy</span>.
              </p>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}