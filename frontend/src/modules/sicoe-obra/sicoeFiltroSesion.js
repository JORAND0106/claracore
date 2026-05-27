/** Borrador / última búsqueda de filtros SicoeObra (solo sesión del navegador). */

const PREFIX = 'cc_sicoe_filtro_sesion_'

export function sicoeFiltroSesionKey(contratoId) {
  return `${PREFIX}${contratoId}`
}

/** Las capas de validación no se persisten (solo aplican tras Buscar en la sesión actual). */
export function sicoeFiltroBundleSinCapasValidacion(bundle) {
  if (!bundle || typeof bundle !== 'object') return bundle
  return { ...bundle, capasValidacion: [], capasValidacionOp: 'and' }
}

export function guardarSicoeFiltroSesion(contratoId, payload) {
  if (!contratoId) return
  try {
    sessionStorage.setItem(
      sicoeFiltroSesionKey(contratoId),
      JSON.stringify({ ...sicoeFiltroBundleSinCapasValidacion(payload), at: Date.now() }),
    )
  } catch { /* ignore */ }
}

export function cargarSicoeFiltroSesion(contratoId) {
  if (!contratoId) return null
  try {
    const raw = sessionStorage.getItem(sicoeFiltroSesionKey(contratoId))
    const parsed = raw ? JSON.parse(raw) : null
    return parsed ? sicoeFiltroBundleSinCapasValidacion(parsed) : null
  } catch {
    return null
  }
}

export function limpiarSicoeFiltroSesion(contratoId) {
  if (!contratoId) return
  try {
    sessionStorage.removeItem(sicoeFiltroSesionKey(contratoId))
  } catch { /* ignore */ }
}
