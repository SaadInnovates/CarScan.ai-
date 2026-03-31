/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { downloadBlob } from '../lib/api'

const AppContext = createContext(null)
const PAYMENT_NUMBER = '+92 3371458542'

const initialFilters = {
  page: 1,
  per_page: 10,
  severity: '',
  file_type: '',
  sort: 'newest',
}

export const toMediaUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path

  const finalize = (value) => {
    try {
      return encodeURI(value)
    } catch {
      return value
    }
  }

  const normalized = String(path).replace(/\\/g, '/')
  const markerIndex = normalized.search(/\/(uploads|reports)\//)

  if (markerIndex >= 0) {
    return finalize(normalized.slice(markerIndex))
  }

  const uploadsIndex = normalized.indexOf('uploads/')
  if (uploadsIndex >= 0) {
    return finalize(`/${normalized.slice(uploadsIndex)}`)
  }

  const reportsIndex = normalized.indexOf('reports/')
  if (reportsIndex >= 0) {
    return finalize(`/${normalized.slice(reportsIndex)}`)
  }

  if (normalized.startsWith('uploads/') || normalized.startsWith('reports/')) {
    return finalize(`/${normalized}`)
  }

  const clean = normalized.replace(/^\./, '')
  return finalize(clean.startsWith('/') ? clean : `/${clean}`)
}

export const formatDate = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

export function AppProvider({ children }) {
  const [token, setTokenState] = useState(localStorage.getItem('damage_ai_token') || '')
  const [profile, setProfile] = useState(null)
  const [usage, setUsage] = useState(null)
  const [stats, setStats] = useState(null)
  const [insights, setInsights] = useState(null)
  const [health, setHealth] = useState(null)
  const [reports, setReports] = useState([])
  const [notifications, setNotifications] = useState([])
  const [scansData, setScansData] = useState({ items: [], page: 1, pages: 1, total: 0 })
  const [selectedScan, setSelectedScan] = useState(null)
  const [adminUsers, setAdminUsers] = useState([])
  const [adminPlatformStats, setAdminPlatformStats] = useState(null)
  const [adminActivity, setAdminActivity] = useState(null)
  const [adminSubscriptionRequests, setAdminSubscriptionRequests] = useState([])
  const [mySubscriptionRequest, setMySubscriptionRequest] = useState(null)

  const [historyFilters, setHistoryFilters] = useState(initialFilters)
  const [loadingKey, setLoadingKey] = useState('')
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const setToken = (nextToken) => {
    if (!nextToken) {
      localStorage.removeItem('damage_ai_token')
      setTokenState('')
      return
    }
    localStorage.setItem('damage_ai_token', nextToken)
    setTokenState(nextToken)
  }

  const showMessage = (text) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 3000)
  }

  const showError = (err) => {
    const detailRaw = err?.response?.data?.detail
    const detail =
      typeof detailRaw === 'string'
        ? detailRaw
        : detailRaw?.message || detailRaw?.detail || err?.message || 'Request failed.'
    setError(String(detail))
    setTimeout(() => setError(''), 3500)
  }

  const getGoogleAuthUrl = async () => {
    try {
      const res = await api.get('/auth/google/url')
      return res.data || { enabled: false, auth_url: '' }
    } catch {
      return { enabled: false, auth_url: '' }
    }
  }

  const logout = useCallback(() => {
    setToken('')
    setProfile(null)
    setUsage(null)
    setStats(null)
    setInsights(null)
    setHealth(null)
    setReports([])
    setNotifications([])
    setScansData({ items: [], page: 1, pages: 1, total: 0 })
    setSelectedScan(null)
    setAdminUsers([])
    setAdminPlatformStats(null)
    setAdminActivity(null)
    setAdminSubscriptionRequests([])
    setMySubscriptionRequest(null)
    setHistoryFilters(initialFilters)
  }, [])

  const fetchHistory = useCallback(async (filters) => {
    const res = await api.get('/scans/history', { params: filters })
    setScansData(res.data)
  }, [])

  const refreshReports = useCallback(async () => {
    const res = await api.get('/reports/my/all')
    setReports(res.data)
  }, [])

  const refreshNotifications = useCallback(async () => {
    const res = await api.get('/profile/notifications')
    setNotifications(res.data)
  }, [])

  // Replace your existing refreshHealth with this:
  const refreshHealth = useCallback(async () => {
    // Use absolute path to avoid /api/v1/health (which 404s)
    const res = await api.get('/health', { baseURL: '' })
    setHealth(res.data)
  }, [])

  const refreshInsights = useCallback(async () => {
    const res = await api.get('/scans/insights/summary')
    setInsights(res.data)
  }, [])

  const refreshMySubscriptionRequest = useCallback(async () => {
    const res = await api.get('/profile/subscription-request/me')
    setMySubscriptionRequest(res.data || null)
  }, [])

  const refreshAdminSubscriptionRequests = useCallback(async (status = 'pending') => {
    const res = await api.get('/admin/subscription-requests', { params: { status } })
    setAdminSubscriptionRequests(res.data?.items || [])
  }, [])

  const refreshAdminData = useCallback(async (planOverride = '', subscriptionStatus = 'pending') => {
    const effectivePlan = planOverride || profile?.plan
    if (effectivePlan !== 'admin') {
      setAdminUsers([])
      setAdminPlatformStats(null)
      setAdminActivity(null)
      setAdminSubscriptionRequests([])
      return
    }

    const [usersRes, platformRes, activityRes, subscriptionRes] = await Promise.all([
      api.get('/admin/users'),
      api.get('/admin/stats/platform'),
      api.get('/admin/stats/activity'),
      api.get('/admin/subscription-requests', { params: { status: subscriptionStatus } }),
    ])

    setAdminUsers(usersRes.data.users || [])
    setAdminPlatformStats(platformRes.data)
    setAdminActivity(activityRes.data)
    setAdminSubscriptionRequests(subscriptionRes.data?.items || [])
  }, [profile?.plan])

  const bootstrapData = useCallback(async () => {
    if (!token) return
    setIsBootstrapping(true)
    try {
      const [profileRes, statsRes] = await Promise.all([
        api.get('/profile'),
        api.get('/scans/stats/overview'),
      ])

      setProfile(profileRes.data.user)
      setUsage(profileRes.data.usage)
      setStats(statsRes.data)

      const plan = profileRes.data?.user?.plan
      if (plan !== 'admin') {
        setAdminUsers([])
        setAdminPlatformStats(null)
        setAdminActivity(null)
        setAdminSubscriptionRequests([])
      }

      await Promise.all([
        fetchHistory(historyFilters),
        refreshReports(),
        refreshNotifications(),
        refreshHealth(),
        refreshInsights(),
        refreshMySubscriptionRequest(),
        plan === 'admin' ? refreshAdminData(plan) : Promise.resolve(),
      ])
    } catch (err) {
      if (err?.response?.status === 401) {
        logout()
      } else {
        showError(err)
      }
    } finally {
      setIsBootstrapping(false)
    }
  }, [
    fetchHistory,
    historyFilters,
    logout,
    refreshAdminData,
    refreshHealth,
    refreshInsights,
    refreshNotifications,
    refreshReports,
    refreshMySubscriptionRequest,
    token,
  ])

  useEffect(() => {
    if (token) {
      bootstrapData()
    }
  }, [bootstrapData, token])

  useEffect(() => {
    if (token) {
      fetchHistory(historyFilters).catch(showError)
    }
  }, [fetchHistory, historyFilters, token])

  const login = async ({ email, password }) => {
    setLoadingKey('auth')
    try {
      const res = await api.post('/auth/login', { email, password })
      setToken(res.data.access_token)
      showMessage('Welcome back.')
    } catch (err) {
      showError(err)
      throw err
    } finally {
      setLoadingKey('')
    }
  }

  const register = async ({ full_name, email, password }) => {
    setLoadingKey('auth')
    try {
      const res = await api.post('/auth/register', { full_name, email, password })
      showMessage(res.data?.detail || 'Account created. Please verify your email before login.')
      return res.data
    } catch (err) {
      showError(err)
      throw err
    } finally {
      setLoadingKey('')
    }
  }

  const verifyEmailToken = async (tokenValue) => {
    if (!tokenValue) return null
    setLoadingKey('verify-email')
    try {
      const res = await api.get('/auth/verify-email', {
        params: { token: tokenValue },
      })
      showMessage(res.data?.detail || 'Email verified successfully.')
      return res.data
    } catch (err) {
      showError(err)
      throw err
    } finally {
      setLoadingKey('')
    }
  }

  const resendVerification = async (email) => {
    if (!email) return null
    setLoadingKey('resend-verification')
    try {
      const res = await api.post('/auth/resend-verification', null, {
        params: { email },
      })
      showMessage(res.data?.detail || 'Verification email sent.')
      return res.data
    } catch (err) {
      showError(err)
      throw err
    } finally {
      setLoadingKey('')
    }
  }

  const uploadScan = async ({ file, notes }) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('notes', notes || '')

    setLoadingKey('upload')
    try {
      const res = await api.post('/scans/upload', formData)
      showMessage('Scan uploaded and analyzed successfully.')
      setSelectedScan(res.data)
      await bootstrapData()
      return res.data
    } catch (err) {
      showError(err)
      throw err
    } finally {
      setLoadingKey('')
    }
  }

  // ── Open scan detail ────────────────────────────────────────────────────────
  // Always fetches the full ScanOut (with detections) from GET /scans/{id}.
  // After the backend fix, admins get a bypass on that endpoint so this works
  // for both regular users and admins without any special-casing here.
  const openScanDetail = async (scanId) => {
    setLoadingKey(`scan-${scanId}`)
    try {
      const res = await api.get(`/scans/${scanId}`)
      setSelectedScan(res.data)
    } catch (err) {
      showError(err)
    } finally {
      setLoadingKey('')
    }
  }

  // ── Open any user's scan as admin ───────────────────────────────────────────
  // Use this when the admin panel has a raw scan summary object (e.g. from the
  // users list) and needs the full ScanOut with detections for the modal.
  // Falls back to setSelectedScan directly if the API call fails (e.g. scan
  // was soft-deleted but admin still wants to inspect the summary).
  const openScanDetailAsAdmin = async (scanOrId) => {
    const scanId = typeof scanOrId === 'object' ? scanOrId?.id : scanOrId
    if (!scanId) return

    setLoadingKey(`scan-${scanId}`)
    try {
      const res = await api.get(`/scans/${scanId}`)
      setSelectedScan(res.data)
    } catch (err) {
      // If fetch fails but we already have a partial object, use it so the
      // modal at least shows filename / severity / stats — just no media.
      if (typeof scanOrId === 'object' && scanOrId?.id) {
        setSelectedScan({ detections: [], ...scanOrId })
      } else {
        showError(err)
      }
    } finally {
      setLoadingKey('')
    }
  }

  const deleteScan = async (scanId) => {
    setLoadingKey(`delete-${scanId}`)
    try {
      await api.delete(`/scans/${scanId}`)
      showMessage('Scan deleted.')
      setSelectedScan(null)
      await bootstrapData()
    } catch (err) {
      showError(err)
    } finally {
      setLoadingKey('')
    }
  }

  const generateReport = async (scanId, reportType) => {
    setLoadingKey(`report-${scanId}-${reportType}`)
    try {
      const res = await api.post(`/reports/${scanId}/generate`, null, {
        params: { report_type: reportType },
      })
      showMessage(`${reportType} report generated.`)
      await downloadBlob(res.data.download_url, `scan-${scanId}-${reportType}.pdf`)
      await refreshReports()
    } catch (err) {
      showError(err)
    } finally {
      setLoadingKey('')
    }
  }

  const saveProfile = async ({ full_name }) => {
    setLoadingKey('profile')
    try {
      const res = await api.put('/auth/me', { full_name })
      setProfile(res.data)
      showMessage('Profile updated.')
      return res.data
    } catch (err) {
      showError(err)
      throw err
    } finally {
      setLoadingKey('')
    }
  }

  const changePassword = async ({ current_password, new_password }) => {
    setLoadingKey('password')
    try {
      await api.post('/auth/change-password', { current_password, new_password })
      showMessage('Password changed successfully.')
    } catch (err) {
      showError(err)
      throw err
    } finally {
      setLoadingKey('')
    }
  }

  const markNotificationRead = async (notificationId) => {
    try {
      await api.put(`/profile/notifications/${notificationId}/read`)
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notificationId
            ? {
                ...item,
                is_read: true,
              }
            : item,
        ),
      )
    } catch (err) {
      showError(err)
    }
  }

  const markAllNotificationsRead = async () => {
    try {
      await api.put('/profile/notifications/read-all')
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })))
      showMessage('All notifications marked as read.')
    } catch (err) {
      showError(err)
    }
  }

  const clearReadNotifications = async () => {
    try {
      await api.delete('/profile/notifications/clear-read')
      setNotifications((prev) => prev.filter((item) => !item.is_read))
      showMessage('Read notifications removed.')
    } catch (err) {
      showError(err)
    }
  }

  const adminUpdateUserPlan = async ({ userId, plan }) => {
    try {
      await api.put(`/admin/users/${userId}/plan`, null, { params: { plan } })
      showMessage('User plan updated.')
      await refreshAdminData()
    } catch (err) {
      showError(err)
    }
  }

  const adminToggleUserActive = async ({ userId, active }) => {
    try {
      await api.put(`/admin/users/${userId}/activate`, null, { params: { active } })
      showMessage(`User ${active ? 'activated' : 'deactivated'}.`)
      await refreshAdminData()
    } catch (err) {
      showError(err)
    }
  }

  const adminDeleteUserAccount = async ({ userId }) => {
    try {
      await api.delete(`/admin/users/${userId}`)
      showMessage('User account deleted.')
      await refreshAdminData()
    } catch (err) {
      showError(err)
    }
  }

  const adminHardDeleteScan = async (scanId) => {
    try {
      await api.delete(`/admin/scans/${scanId}/hard-delete`)
      showMessage('Scan permanently deleted by admin.')
      await Promise.all([refreshAdminData(), bootstrapData()])
    } catch (err) {
      showError(err)
    }
  }

  const submitSubscriptionRequest = async ({ paymentMethod, receiptFile }) => {
    const formData = new FormData()
    formData.append('payment_method', paymentMethod)
    formData.append('receipt', receiptFile)

    setLoadingKey('subscription-request')
    try {
      await api.post('/profile/subscription-request', formData)
      showMessage('Subscription request submitted. Admin will review your receipt.')
      await Promise.all([refreshMySubscriptionRequest(), refreshNotifications()])
    } catch (err) {
      showError(err)
      throw err
    } finally {
      setLoadingKey('')
    }
  }

  const adminReviewSubscriptionRequest = async ({ requestId, action, note = '', status = 'pending' }) => {
    try {
      await api.put(`/admin/subscription-requests/${requestId}/review`, null, {
        params: { action, note },
      })
      showMessage(`Subscription request ${action}d.`)
      await Promise.all([refreshAdminData('', status), refreshAdminSubscriptionRequests(status)])
    } catch (err) {
      showError(err)
    }
  }

  const exportScans = async (format) => {
    const url = format === 'csv' ? '/export/scans/csv' : '/export/scans/json'
    const filename = format === 'csv' ? 'my_scans.csv' : 'my_scans.json'
    await downloadBlob(url, filename)
  }

  const downloadAnnotatedScan = async (scanId) => {
    await downloadBlob(`/scans/${scanId}/download`, `scan-${scanId}`)
  }

  const downloadReport = async ({ reportId, scanId, reportType }) => {
    await downloadBlob(`/reports/${reportId}/download`, `scan-${scanId}-${reportType}.pdf`)
  }

  const scansRemainingPercent = useMemo(() => {
    if (!usage?.scan_limit) return 0
    return Math.min(100, Math.round((usage.scans_this_month / usage.scan_limit) * 100))
  }, [usage])

  const value = {
    token,
    setToken,
    profile,
    usage,
    stats,
    insights,
    health,
    reports,
    notifications,
    scansData,
    selectedScan,
    setSelectedScan,
    historyFilters,
    setHistoryFilters,
    loadingKey,
    isBootstrapping,
    error,
    message,
    showError,
    showMessage,
    login,
    register,
    verifyEmailToken,
    resendVerification,
    getGoogleAuthUrl,
    logout,
    uploadScan,
    openScanDetail,
    openScanDetailAsAdmin,   // ← new: use this in admin panel scan row clicks
    deleteScan,
    generateReport,
    saveProfile,
    changePassword,
    markNotificationRead,
    markAllNotificationsRead,
    clearReadNotifications,
    exportScans,
    downloadAnnotatedScan,
    downloadReport,
    bootstrapData,
    refreshAdminData,
    refreshAdminSubscriptionRequests,
    adminUsers,
    adminPlatformStats,
    adminActivity,
    adminSubscriptionRequests,
    mySubscriptionRequest,
    adminUpdateUserPlan,
    adminToggleUserActive,
    adminDeleteUserAccount,
    adminHardDeleteScan,
    submitSubscriptionRequest,
    adminReviewSubscriptionRequest,
    paymentNumber: PAYMENT_NUMBER,
    scansRemainingPercent,
    toMediaUrl,
    formatDate,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export const useAppContext = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider')
  }
  return context
}