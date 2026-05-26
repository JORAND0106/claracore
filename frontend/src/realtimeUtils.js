/**
 * Utilidades compartidas para suscripciones Supabase Realtime.
 * Debounce: 8 s idle + tope 30 s en ráfaga (evita refrescar la UI en cada fila).
 */

export const REALTIME_IDLE_MS = 8000
export const REALTIME_MAX_MS = 30000

const FORCE_OFFLINE_KEY = 'claracore_force_offline'

/** Misma lógica que OfflineContext.efectivoOffline (sin React). */
export function isEfectivoOffline() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  try {
    return localStorage.getItem(FORCE_OFFLINE_KEY) === 'true'
  } catch {
    return false
  }
}

/** @param {() => void} onFlush */
export function createRealtimeDebouncer(onFlush, idleMs = REALTIME_IDLE_MS, maxMs = REALTIME_MAX_MS) {
  let idleTimer = null
  let maxTimer = null
  let burstStart = null

  const clearTimers = () => {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
    if (maxTimer) {
      clearTimeout(maxTimer)
      maxTimer = null
    }
  }

  const dispose = () => {
    clearTimers()
    burstStart = null
  }

  const schedule = () => {
    if (burstStart == null) {
      burstStart = Date.now()
      maxTimer = setTimeout(() => {
        dispose()
        onFlush()
      }, maxMs)
    }
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      dispose()
      onFlush()
    }, idleMs)
  }

  return { schedule, dispose }
}
