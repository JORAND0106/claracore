/**
 * Telemetría de navegador → mismo Application Insights que el backend.
 * Activación manual del desarrollador (localStorage). Errores y fallos: 100%.
 * Actividad exitosa rutinaria: muestreada (~10 %).
 */

import { API_BASE, SUPABASE_URL } from '../apiBase'

export const FRONTEND_CLOUD_ROLE = 'claracore-frontend'
export const TELEMETRY_SOURCE = 'browser'
export const TELEMETRY_ENABLED_KEY = 'cc_browser_telemetry_enabled'
export const SUCCESS_SAMPLE_RATE = 0.1

const IGNORE_URL_PARTS = [
  'applicationinsights.io',
  'monitor.azure.com',
  'visualstudio.com',
  '/_appinsights',
  '/api/appinsights',
  'mapbox.com',
  'maptiler.com',
  'openstreetmap.org',
  'tile.',
  '/index.html',
  '/sw.js',
  '/assets/',
]

let ai = null
let sdkLoading = null
let fetchInstalled = false
let errorsInstalled = false
let originalFetch = null
let currentView = 'landing'
let currentUser = null

function connectionString() {
  return (import.meta.env.VITE_APPLICATIONINSIGHTS_CONNECTION_STRING || '').trim()
}

export function isBrowserTelemetryConfigured() {
  return Boolean(connectionString())
}

export function isBrowserTelemetryEnabled() {
  try {
    return localStorage.getItem(TELEMETRY_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

function pageContext() {
  try {
    const path = `${window.location.pathname || ''}${window.location.search || ''}`
    return currentView && currentView !== 'landing' ? `${currentView} · ${path}` : path || currentView
  } catch {
    return currentView || 'unknown'
  }
}

function normalizeEndpoint(rawUrl) {
  try {
    const u = new URL(rawUrl, window.location.origin)
    const path = u.pathname + (u.search || '')
    if (!/^https?:\/\//i.test(rawUrl) && rawUrl.startsWith('/')) return path
    if (API_BASE && rawUrl.startsWith(API_BASE)) return path
    if (SUPABASE_URL && rawUrl.startsWith(SUPABASE_URL)) return `[supabase]${path}`
    return `${u.host}${path}`
  } catch {
    return String(rawUrl || '').slice(0, 240)
  }
}

function shouldSkipUrl(rawUrl) {
  const s = String(rawUrl || '')
  if (!s) return true
  const lower = s.toLowerCase()
  return IGNORE_URL_PARTS.some(part => lower.includes(part.toLowerCase()))
}

function isPlatformRequest(rawUrl) {
  if (shouldSkipUrl(rawUrl)) return false
  try {
    const u = new URL(rawUrl, window.location.origin)
    if (u.origin === window.location.origin) {
      return u.pathname.startsWith('/') && !u.pathname.startsWith('/api/appinsights')
    }
    const apiBase = (API_BASE || '').replace(/\/$/, '')
    if (apiBase && (rawUrl.startsWith(apiBase) || u.href.startsWith(apiBase))) return true
    if (SUPABASE_URL && rawUrl.startsWith(SUPABASE_URL)) return true
    return false
  } catch {
    return false
  }
}

function shouldSampleSuccess() {
  return Math.random() < SUCCESS_SAMPLE_RATE
}

function baseProperties(extra = {}) {
  const page = pageContext()
  const props = {
    'telemetry.source': TELEMETRY_SOURCE,
    'page.view': currentView,
    'page.url': page,
    ...extra,
  }
  if (currentUser?.email) props['user.email'] = String(currentUser.email)
  return props
}

function loadSdk() {
  if (ai) return Promise.resolve(ai)
  if (sdkLoading) return sdkLoading
  const cs = connectionString()
  if (!cs) return Promise.resolve(null)
  sdkLoading = import('@microsoft/applicationinsights-web')
    .then(({ ApplicationInsights }) => {
      ai = new ApplicationInsights({
        config: {
          connectionString: cs,
          enableAutoRouteTracking: false,
          disableFetchTracking: true,
          disableAjaxTracking: true,
          disableExceptionTracking: true,
          samplingPercentage: 100,
        },
      })
      ai.loadAppInsights()
      ai.addTelemetryInitializer(envelope => {
        envelope.tags = envelope.tags || {}
        envelope.tags['ai.cloud.role'] = FRONTEND_CLOUD_ROLE
        envelope.tags['ai.cloud.roleInstance'] = 'browser'
        const base = envelope.baseData || envelope.data?.baseData
        if (base) {
          base.properties = { ...(base.properties || {}), 'telemetry.source': TELEMETRY_SOURCE }
          if (base.success === true && base.properties['telemetry.forceSend'] !== '1') {
            if (base.properties['telemetry.sampled'] !== '1') return false
          }
        }
        return true
      })
      if (currentUser?.id) {
        ai.setAuthenticatedUserContext(currentUser.id, currentUser.email || undefined, true)
      }
      return ai
    })
    .finally(() => {
      sdkLoading = null
    })
  return sdkLoading
}

function trackDependency({ endpoint, url, durationMs, success, statusCode, message, forceSend }) {
  if (!isBrowserTelemetryEnabled()) return
  const sampled = forceSend || !success || shouldSampleSuccess()
  if (success && !sampled) return
  loadSdk()
    .then(sdk => {
      if (!sdk) return
      const props = baseProperties({
        'api.endpoint': endpoint,
        'wait.ms': String(Math.round(durationMs)),
        'telemetry.sampled': sampled ? '1' : '0',
        'telemetry.forceSend': forceSend || !success ? '1' : '0',
      })
      if (message) props['error.message'] = String(message).slice(0, 500)
      sdk.trackDependencyData({
        id: crypto.randomUUID?.() || `${Date.now()}`,
        name: endpoint,
        target: endpoint.split('/')[0] || 'claracore-api',
        data: url,
        duration: Math.max(0, durationMs),
        success: !!success,
        responseCode: statusCode ?? (success ? 200 : 0),
        properties: props,
      })
    })
    .catch(() => {})
}

function trackBrowserException(message, extra = {}) {
  if (!isBrowserTelemetryEnabled()) return
  loadSdk()
    .then(sdk => {
      if (!sdk) return
      sdk.trackException({
        exception: new Error(String(message || 'Error de navegador').slice(0, 500)),
        properties: baseProperties({
          'telemetry.forceSend': '1',
          ...extra,
        }),
      })
    })
    .catch(() => {})
}

function installFetchInstrument() {
  if (fetchInstalled || typeof window === 'undefined') return
  fetchInstalled = true
  originalFetch = window.fetch.bind(window)
  window.fetch = async function instrumentedFetch(input, init) {
    if (!isBrowserTelemetryEnabled()) {
      return originalFetch(input, init)
    }
    const rawUrl = typeof input === 'string' ? input : input?.url
    if (!isPlatformRequest(rawUrl)) {
      return originalFetch(input, init)
    }
    const endpoint = normalizeEndpoint(rawUrl)
    const start = performance.now()
    try {
      const response = await originalFetch(input, init)
      const durationMs = performance.now() - start
      if (!response.ok) {
        trackDependency({
          endpoint,
          url: rawUrl,
          durationMs,
          success: false,
          statusCode: response.status,
          message: `HTTP ${response.status}`,
          forceSend: true,
        })
      } else {
        trackDependency({
          endpoint,
          url: rawUrl,
          durationMs,
          success: true,
          statusCode: response.status,
          forceSend: false,
        })
      }
      return response
    } catch (err) {
      const durationMs = performance.now() - start
      const msg = err?.message || 'Failed to fetch'
      trackDependency({
        endpoint,
        url: rawUrl,
        durationMs,
        success: false,
        statusCode: 0,
        message: msg,
        forceSend: true,
      })
      trackBrowserException(msg, {
        'api.endpoint': endpoint,
        'wait.ms': String(Math.round(durationMs)),
        'error.kind': 'network',
      })
      throw err
    }
  }
}

function installGlobalErrorHandlers() {
  if (errorsInstalled || typeof window === 'undefined') return
  errorsInstalled = true
  window.addEventListener('error', event => {
    if (!isBrowserTelemetryEnabled()) return
    const msg = event.message || event.error?.message || 'Error JS'
    trackBrowserException(msg, {
      'error.kind': 'uncaught',
      'error.source': event.filename ? `${event.filename}:${event.lineno}` : '',
    })
  })
  window.addEventListener('unhandledrejection', event => {
    if (!isBrowserTelemetryEnabled()) return
    const reason = event.reason
    const msg =
      (reason && typeof reason === 'object' && reason.message) ||
      (typeof reason === 'string' ? reason : '') ||
      'Unhandled promise rejection'
    trackBrowserException(msg, { 'error.kind': 'unhandledrejection' })
  })
}

export function setBrowserTelemetryView(view) {
  currentView = String(view || 'general').trim() || 'general'
}

export function setBrowserTelemetryUser(user) {
  if (!user?.id) {
    clearBrowserTelemetryUser()
    return
  }
  currentUser = { id: String(user.id), email: user.email ? String(user.email) : '' }
  if (ai && isBrowserTelemetryEnabled()) {
    ai.setAuthenticatedUserContext(currentUser.id, currentUser.email || undefined, true)
  }
}

export function clearBrowserTelemetryUser() {
  currentUser = null
  if (ai) ai.clearAuthenticatedUserContext()
}

export function setBrowserTelemetryEnabled(on) {
  try {
    if (on) localStorage.setItem(TELEMETRY_ENABLED_KEY, '1')
    else localStorage.removeItem(TELEMETRY_ENABLED_KEY)
  } catch {
    /* ignore */
  }
  if (on) {
    loadSdk()
      .then(sdk => {
        if (currentUser?.id && sdk) {
          sdk.setAuthenticatedUserContext(currentUser.id, currentUser.email || undefined, true)
        }
      })
      .catch(() => {})
  } else if (ai) {
    try {
      ai.flush()
    } catch {
      /* ignore */
    }
  }
}

export function initBrowserTelemetry() {
  installFetchInstrument()
  installGlobalErrorHandlers()
  if (isBrowserTelemetryEnabled()) loadSdk().catch(() => {})
}
