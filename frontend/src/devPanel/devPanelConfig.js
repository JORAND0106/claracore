/** Configuración del panel de diagnóstico (solo desarrollador). */

function parseConnectionString(cs) {
  const out = {}
  if (!cs) return out
  for (const part of String(cs).split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

const connRaw = import.meta.env.VITE_APPLICATIONINSIGHTS_CONNECTION_STRING || ''
const parsed = parseConnectionString(connRaw)

export const DEV_PANEL_KEY = (import.meta.env.VITE_DEVELOPER_PANEL_KEY || '').trim()
export const APPINSIGHTS_APP_ID = (parsed.ApplicationId || import.meta.env.VITE_APPINSIGHTS_APP_ID || '').trim()
export const APPINSIGHTS_API_KEY = (import.meta.env.VITE_APPINSIGHTS_API_KEY || '').trim()

/** En dev, Vite proxy evita CORS. En producción, SWA Azure Function `/api/appinsights/query`. */
export const APPINSIGHTS_QUERY_BASE = import.meta.env.DEV
  ? '/_appinsights'
  : '/api/appinsights'

export function devPanelConfigured() {
  if (!DEV_PANEL_KEY) return false
  if (import.meta.env.DEV) {
    return Boolean(APPINSIGHTS_APP_ID && APPINSIGHTS_API_KEY)
  }
  return true
}

export function devPanelConfigHint() {
  const missing = []
  if (!DEV_PANEL_KEY) missing.push('VITE_DEVELOPER_PANEL_KEY')
  if (import.meta.env.DEV) {
    if (!APPINSIGHTS_APP_ID) {
      missing.push('VITE_APPLICATIONINSIGHTS_CONNECTION_STRING (ApplicationId) o VITE_APPINSIGHTS_APP_ID')
    }
    if (!APPINSIGHTS_API_KEY) missing.push('VITE_APPINSIGHTS_API_KEY')
  } else {
    missing.push('(producción) configurar DEVELOPER_PANEL_KEY, APPLICATIONINSIGHTS_CONNECTION_STRING y APPINSIGHTS_API_KEY en Azure Static Web App')
  }
  return missing
}

const SESSION_FLAG = 'cc_devpanel_ok'

export function isDevPanelUnlocked() {
  try {
    return sessionStorage.getItem(SESSION_FLAG) === '1'
  } catch {
    return false
  }
}

export function unlockDevPanel() {
  try {
    sessionStorage.setItem(SESSION_FLAG, '1')
  } catch {
    /* ignore */
  }
}

export function lockDevPanel() {
  try {
    sessionStorage.removeItem(SESSION_FLAG)
  } catch {
    /* ignore */
  }
}

export function verifyDevPanelKey(input) {
  const a = String(input || '')
  const b = DEV_PANEL_KEY
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
