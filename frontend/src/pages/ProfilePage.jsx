import { useState } from 'react'
import { useAppContext } from '../context/AppContext'

export default function ProfilePage() {
  const {
    profile,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    clearReadNotifications,
    saveProfile,
    changePassword,
    submitSubscriptionRequest,
    mySubscriptionRequest,
    paymentNumber,
    loadingKey,
    formatDate,
  } = useAppContext()

  const [profileForm, setProfileForm] = useState({ full_name: '' })
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' })
  const [subscriptionForm, setSubscriptionForm] = useState({ paymentMethod: 'jazzcash', receiptFile: null })

  const submitProfile = async (event) => {
    event.preventDefault()
    await saveProfile(profileForm)
  }

  const submitPassword = async (event) => {
    event.preventDefault()
    await changePassword(passwordForm)
    setPasswordForm({ current_password: '', new_password: '' })
  }

  const submitSubscription = async (event) => {
    event.preventDefault()
    if (!subscriptionForm.receiptFile) return
    await submitSubscriptionRequest(subscriptionForm)
    setSubscriptionForm((prev) => ({ ...prev, receiptFile: null }))
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <section className="panel-surface rounded-2xl p-4 sm:p-6">
        <h3 className="text-lg font-medium text-white">Profile settings</h3>
        <form onSubmit={submitProfile} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Full name</span>
            <input
              value={profileForm.full_name || profile?.full_name || ''}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, full_name: event.target.value }))}
              className="field-input"
            />
          </label>
          <button
            type="submit"
            disabled={loadingKey === 'profile'}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-70"
          >
            Save profile
          </button>
        </form>
      </section>

      <section className="panel-surface rounded-2xl p-4 sm:p-6">
        <h3 className="text-lg font-medium text-white">Change password</h3>
        <form onSubmit={submitPassword} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Current password</span>
            <input
              type="password"
              value={passwordForm.current_password}
              onChange={(event) =>
                setPasswordForm((prev) => ({ ...prev, current_password: event.target.value }))
              }
              className="field-input"
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">New password</span>
            <input
              type="password"
              value={passwordForm.new_password}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, new_password: event.target.value }))}
              className="field-input"
              required
            />
          </label>
          <button
            type="submit"
            disabled={loadingKey === 'password'}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-70"
          >
            Update password
          </button>
        </form>
      </section>

      <section className="panel-surface rounded-2xl p-4 sm:p-6 xl:col-span-2">
        <h3 className="text-lg font-medium text-white">Upgrade to Pro</h3>
        <p className="mt-1 text-sm text-slate-400">
          Pay via JazzCash or Easypaisa to <span className="text-cyan-300">{paymentNumber}</span> and upload your receipt.
        </p>

        {mySubscriptionRequest ? (
          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/45 p-3 text-sm text-slate-300">
            <p>
              Latest request: <span className="capitalize text-white">{mySubscriptionRequest.status}</span> via{' '}
              <span className="capitalize text-white">{mySubscriptionRequest.payment_method}</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">Submitted {formatDate(mySubscriptionRequest.created_at)}</p>
            {mySubscriptionRequest.admin_note ? (
              <p className="mt-1 text-xs text-amber-200">Admin note: {mySubscriptionRequest.admin_note}</p>
            ) : null}
          </div>
        ) : null}

        <form onSubmit={submitSubscription} className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Payment method</span>
            <select
              value={subscriptionForm.paymentMethod}
              onChange={(event) =>
                setSubscriptionForm((prev) => ({ ...prev, paymentMethod: event.target.value }))
              }
              className="field-input"
            >
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">Easypaisa</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Receipt screenshot</span>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(event) =>
                setSubscriptionForm((prev) => ({ ...prev, receiptFile: event.target.files?.[0] || null }))
              }
              className="field-input file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-400/15 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-cyan-200"
              required
            />
          </label>

          <button
            type="submit"
            disabled={loadingKey === 'subscription-request'}
            className="btn-primary h-11 px-5 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Submit request
          </button>
        </form>
      </section>

      <section className="panel-surface rounded-2xl p-4 sm:p-6 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-medium text-white">Notifications</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={markAllNotificationsRead}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-300/40"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={clearReadNotifications}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:border-rose-300/40 hover:text-rose-200"
            >
              Clear read
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {notifications.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl border px-4 py-3 ${
                item.is_read ? 'border-slate-700 bg-slate-900/45' : 'border-cyan-300/35 bg-cyan-900/10'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-100">{item.message}</p>
                <button
                  type="button"
                  disabled={item.is_read}
                  onClick={() => markNotificationRead(item.id)}
                  className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 disabled:opacity-35"
                >
                  Mark read
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">{formatDate(item.created_at)}</p>
            </div>
          ))}
          {notifications.length === 0 ? <p className="text-sm text-slate-400">No notifications available.</p> : null}
        </div>
      </section>
    </div>
  )
}
