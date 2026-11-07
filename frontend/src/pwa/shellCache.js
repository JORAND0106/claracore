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
      if (u && !u.startsWith('data:')) {
        try {
          const abs = new URL(u, location.origin)
          if (abs.origin === location.origin) urls.add(abs.pathname + abs.search)
        } catch { /* ignore */ }
      }
    })
    document.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
      const u = el.getAttribute('href')
      if (!u) return
      try {
        const abs = new URL(u, location.origin)
        if (abs.origin === location.origin) urls.add(abs.pathname + abs.search)
      } catch { /* ignore */ }
    })
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

/** Arranque PWA: refuerza caché de inmediato (no esperar 800 ms). */
export function initOfflineShell() {
  getOrCreateDeviceId()
  const run = () => {
    precacheShellViaServiceWorker()
    requestPersistentStorage()
  }
  // Inmediato + tras load (por si aún faltan chunks)
  run()
  if (document.readyState !== 'complete') {
    window.addEventListener('load', () => setTimeout(run, 50), { once: true })
  } else {
    setTimeout(run, 50)
  }
  window.addEventListener('online', () => setTimeout(run, 300))
}

export { PRECACHE_MSG }
