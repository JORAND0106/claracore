/**
 * Módulos que pueden usarse sin servidor (arranque offline + Bloc).
 * El resto requiere conexión → aviso institucional breve.
 */

export const OFFLINE_OK_MODULOS = new Set([
  'inicio',
  'bloc_notas',
  'mapa_navegacion',
])

export const OFFLINE_MODULE_MESSAGE =
  'Este módulo necesita conexión. Vuelva a intentarlo cuando tenga señal.'

export function moduloRequiereConexion(moduloKey) {
  const key = String(moduloKey || '')
  return key.length > 0 && !OFFLINE_OK_MODULOS.has(key)
}

export function isBrowserOffline() {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false
  } catch {
    return false
  }
}
