// adminAnalytics.js
// Unified analytics API — one endpoint, role-aware response.
// Returns scope: "user" | "admin" so the caller can render the right dashboard.

import api from '../lib/api'

/**
 * Fetch analytics for the current user.
 * - Regular users  → personal analytics  (scope: "user")
 * - Admin users    → platform analytics  (scope: "admin")
 *
 * Shape guaranteed by the backend:
 * {
 *   scope: "user" | "admin",
 *   severity_trends: { months, severities, counts },
 *   report_type_distribution: { types, counts },
 *
 *   // user only:
 *   user_summary?: { total_scans, scans_last_30_days, severity_breakdown },
 *
 *   // admin only:
 *   platform_stats?,
 *   user_growth?,
 *   daily_active_users?,
 *   churn_rate?,
 *   avg_scans?,
 *   most_active_users?,
 *   damage_label_frequency?,
 *   scan_file_type_distribution?,
 *   top_report_types?,
 *   activity_stats?,
 * }
 */
export const fetchAnalytics = async () => {
  const { data } = await api.get('/admin/analytics')
  return data
}

/**
 * @deprecated  Use fetchAnalytics() — kept for backward-compat shims only.
 */
export const fetchUserAnalytics = async () => {
  const data = await fetchAnalytics()
  return {
    reportType:      data.report_type_distribution,
    severityTrends:  data.severity_trends,
  }
}

/**
 * @deprecated  Use fetchAnalytics() — kept for backward-compat shims only.
 */
export const fetchAdminAnalytics = async () => {
  const data = await fetchAnalytics()
  return {
    damageLabel:    data.damage_label_frequency,
    activeUsers:    data.most_active_users,
    fileType:       data.scan_file_type_distribution,
    dailyActive:    data.daily_active_users,
    churnRate:      data.churn_rate,
    avgScans:       data.avg_scans,
    topReportTypes: data.top_report_types,
  }
}

/**
 * Download a blob from a given URL with Authorization header (for admin export)
 * @param {string} url
 * @param {string} filenameHint
 */
export const downloadBlob = async (url, filenameHint) => {
  const normalizedUrl = url.startsWith('/api/') ? url : `/api/v1${url.startsWith('/') ? url : `/${url}`}`;
  const token = localStorage.getItem('damage_ai_token');
  const response = await fetch(normalizedUrl, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error('Failed to download file');
  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filenameHint;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
};

export default fetchAnalytics