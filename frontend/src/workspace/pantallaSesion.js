/** Recuerda el módulo abierto para volver a él si el navegador recarga la página. */

const CLAVE = 'cc_pantalla'

function almacen() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function recordarPantalla(userId, contratoId, modulo, storage = almacen()) {
  if (!storage || !userId || !modulo) return
  try {
    storage.setItem(CLAVE, JSON.stringify({
      userId: String(userId),
      contratoId: contratoId == null ? null : Number(contratoId),
      modulo: String(modulo),
    }))
  } catch { /* el cupo del navegador no debe tumbar la pantalla */ }
}

export function leerPantalla(userId, contratoId, storage = almacen()) {
  if (!storage || !userId) return ''
  try {
    const raw = storage.getItem(CLAVE)
    if (!raw) return ''
    const data = JSON.parse(raw)
    if (!data || String(data.userId) !== String(userId)) return ''
    if (contratoId != null && data.contratoId != null && Number(data.contratoId) !== Number(contratoId)) {
      return ''
    }
    return String(data.modulo || '')
  } catch {
    return ''
  }
}

export function olvidarPantalla(storage = almacen()) {
  try { storage?.removeItem(CLAVE) } catch { /* ignore */ }
}
