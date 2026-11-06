/**
 * Precarga del shell para arranque sin conexión + almacenamiento persistente.
 * No modifica el modo offline de SicoeObra.
 */

const PRECACHE_MSG = 'CLARACORE_PRECACHE_URLS'
const DEVICE_ID_KEY = 'claracore_device_id'

export function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (id && id.length >= 8) return id
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(DEVICE_ID_KEY, id)
    return id
  } catch {
    return `dev_${Date.now()}`
  }
}

/** Recolecta URLs del documento actual (scripts/CSS) para precache del SW. */
export function collectShellUrls() {
  const urls = new Set(['/', '/index.html', '/favicon.png', '/manifest.webmanifest'])
  try {
    document.querySelectorAll('script[src]').forEach((el) => {
      const u = el.getAttribute('src')
      if (u && !u.startsWith('data:')) urls.add(new URL(u, location.origin).pathname + new URL(u, location.origin).search)
    })
    document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
      const u = el.getAttribute('href')
      if (u && !u.startsWith('http')) {
        try {
          const abs = new URL(u, location.origin)
          if (abs.origin === location.origin) urls.add(abs.pathname + abs.search)
        } catch { /* ignore */ }
      }
    })
    // Chunks Vite ya cargados
    performance.getEntriesByType('resource').forEach((e) => {
      try {
        const abs = new URL(e.name)
        if (abs.origin === location.origin && /\/assets\//.test(abs.pathname)) {
          urls.add(abs.pathname + abs.search)
        }
      } catch { /* ignore */ }
    })
  } catch { /* ignore */ }
  return [...urls]
}

export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false
    const already = await navigator.storage.persisted?.()
    if (already) return true
    return !!(await navigator.storage.persist())
  } catch {
    return false
  }
}

export async function precacheShellViaServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const urls = collectShellUrls()
    const worker = reg.active || navigator.serviceWorker.controller
    if (worker) {
      worker.postMessage({ type: PRECACHE_MSG, urls })
    }
  } catch { /* ignore */ }
}

/** Arranque PWA: SW ya registrado en App; aquí reforzamos caché + persistencia. */
export function initOfflineShell() {
  getOrCreateDeviceId()
  const run = () => {
    precacheShellViaServiceWorker()
    requestPersistentStorage()
  }
  if (document.readyState === 'complete') {
    setTimeout(run, 800)
  } else {
    window.addEventListener('load', () => setTimeout(run, 800), { once: true })
  }
  // Tras navegar con red, re-precachear assets nuevos
  window.addEventListener('online', () => setTimeout(run, 500))
}

export { PRECACHE_MSG }
