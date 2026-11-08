/**
 * Ciclo de vida del editor de esquema (C-OUT-14):
 * - Contador de editores abiertos → la sesión no debe cerrarse por inactividad.
 * - Señal de keep-alive → touch de actividad mientras se dibuja.
 * - Pendiente de reapertura → si el proceso mata el árbol React (iPad), al volver
 *   al mismo lugar se reabre el editor y se restaura el borrador.
 */

const OPEN_KEY = 'cc_esquema_editor_open_v1'
const listeners = new Set()

let openCount = 0

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function notify() {
  for (const fn of listeners) {
    try { fn(openCount) } catch { /* ignore */ }
  }
}

export function subscribeEsquemaEditorOpen(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getEsquemaEditorOpenCount() {
  return openCount
}

export function isEsquemaEditorOpen() {
  return openCount > 0
}

/**
 * @param {{ module?: string, entityId?: string|number, contratoId?: string|number, title?: string }} meta
 */
export function markEsquemaEditorOpened(meta = {}) {
  openCount += 1
  try {
    sessionStorage.setItem(OPEN_KEY, JSON.stringify({
      module: meta.module || null,
      entityId: meta.entityId != null ? String(meta.entityId) : null,
      contratoId: meta.contratoId != null ? String(meta.contratoId) : null,
      title: meta.title || null,
      openedAt: Date.now(),
    }))
  } catch { /* ignore */ }
  notify()
  return () => markEsquemaEditorClosed()
}

export function markEsquemaEditorClosed() {
  openCount = Math.max(0, openCount - 1)
  if (openCount === 0) {
    try { sessionStorage.removeItem(OPEN_KEY) } catch { /* ignore */ }
  }
  notify()
}

/** Snapshot del último editor abierto (para recuperar tras kill de página). */
export function peekEsquemaEditorPendingReopen() {
  try {
    return safeParse(sessionStorage.getItem(OPEN_KEY))
  } catch {
    return null
  }
}

/**
 * Consume la pendiente si coincide con el lugar actual.
 * @returns {object|null}
 */
export function consumeEsquemaEditorPendingReopen({ module, entityId, contratoId } = {}) {
  const pending = peekEsquemaEditorPendingReopen()
  if (!pending) return null
  if (module != null && pending.module != null && String(pending.module) !== String(module)) return null
  if (entityId != null && pending.entityId != null && String(pending.entityId) !== String(entityId)) return null
  if (contratoId != null && pending.contratoId != null && String(pending.contratoId) !== String(contratoId)) return null
  try { sessionStorage.removeItem(OPEN_KEY) } catch { /* ignore */ }
  return pending
}

/** True si hay un editor abierto o una sesión marcada (página recién recuperada). */
export function shouldKeepSessionAliveForEsquema() {
  if (openCount > 0) return true
  const pending = peekEsquemaEditorPendingReopen()
  if (!pending?.openedAt) return false
  // Ventana corta tras kill de página para no bloquear logout legítimo.
  return (Date.now() - Number(pending.openedAt)) < 2 * 60 * 60 * 1000
}
