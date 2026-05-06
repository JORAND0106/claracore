import { API_BASE, logApiFailure } from './apiBase'

/** Convierte `detail` de FastAPI (string o lista de errores de validación) en texto legible. */
export function formatFetchError(data) {
  if (data == null) return ''
  const d = data.detail != null ? data.detail : data
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {
    return d
      .map((x) => (x && typeof x === 'object' && (x.msg || x.message)) ? (x.msg || x.message) : JSON.stringify(x))
      .filter(Boolean)
      .join('; ')
  }
  if (typeof d === 'object') return d.message || JSON.stringify(d)
  return String(d)
}

/**
 * Fetch autenticado al API ClaraCore. En dev, API_BASE es '' → mismo origen (proxy Vite).
 * No lanza en 4xx/5xx: devuelve objeto con `detail` o `_error` para manejo en UI.
 */
export async function fetchConFallback(path, options = {}) {
  const token = localStorage.getItem('cc_token') || sessionStorage.getItem('cc_token')
  const url = /^https?:\/\//i.test(path) ? path : `${API_BASE || ''}${path.startsWith('/') ? path : `/${path}`}`
  const headers = { ...(options.headers || {}) }
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`
  }
  let body = options.body
  if (body != null && typeof body === 'object' && !(body instanceof FormData)) {
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json'
    body = JSON.stringify(body)
  }
  try {
    const res = await fetch(url, { ...options, headers, body })
    const text = await res.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { detail: text || res.statusText }
    }
    if (!res.ok) {
      const msg = formatFetchError(data)
      logApiFailure(`fetchConFallback ${path}`, new Error(msg || res.statusText))
      return { _error: true, status: res.status, detail: msg || data?.detail || data || res.statusText, ...data }
    }
    return data
  } catch (e) {
    logApiFailure(`fetchConFallback ${path}`, e)
    return { _error: true, detail: e?.message || 'Red' }
  }
}
