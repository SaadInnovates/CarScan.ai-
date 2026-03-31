import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('damage_ai_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const downloadBlob = async (url, filenameHint) => {
  const normalizedUrl = url.startsWith('/api/') ? url : `/api/v1${url.startsWith('/') ? url : `/${url}`}`
  const token = localStorage.getItem('damage_ai_token')
  const response = await axios.get(normalizedUrl, {
    responseType: 'blob',
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
  })

  const blobUrl = window.URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filenameHint
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(blobUrl)
}

export default api
