import { LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'

export default function EmailVerificationPage() {
  const { verifyEmailToken } = useAppContext()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const token = params.get('token')

  const [status, setStatus] = useState(token ? 'loading' : 'error')
  const [detail, setDetail] = useState(token ? 'Verifying your email...' : 'Verification token is missing from the link.')

  useEffect(() => {
    if (!token) return

    verifyEmailToken(token)
      .then((res) => {
        setStatus('success')
        setDetail(res?.detail || 'Email verified successfully. You can now sign in.')
      })
      .catch((err) => {
        const message = err?.response?.data?.detail || 'Verification failed. The link may be invalid or expired.'
        setStatus('error')
        setDetail(message)
      })
  }, [token, verifyEmailToken])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030711] px-4 py-8 sm:px-6 lg:px-8">
      <div className="hero-gradient pointer-events-none absolute inset-0" />
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-cyan-200/10 bg-slate-900/70 p-6 shadow-[0_40px_80px_-48px_rgba(34,211,238,0.75)] backdrop-blur-xl sm:p-8">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">Email Verification</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Account Confirmation</h1>

        <div className="mt-6 rounded-2xl border border-slate-700/80 bg-slate-950/55 p-4">
          {status === 'loading' ? (
            <div className="inline-flex items-center gap-2 text-slate-200">
              <LoaderCircle size={16} className="animate-spin" />
              Verifying...
            </div>
          ) : (
            <p className={status === 'success' ? 'text-emerald-200' : 'text-rose-200'}>{detail}</p>
          )}
        </div>

        <Link
          to="/auth"
          className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-cyan-200/20 px-4 py-3 text-sm text-cyan-200 transition hover:border-cyan-100/40"
        >
          Go to Sign In
        </Link>
      </div>
    </div>
  )
}
