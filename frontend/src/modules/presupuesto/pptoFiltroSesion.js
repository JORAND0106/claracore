/** Borrador / última búsqueda de filtros presupuesto (solo sesión del navegador). */

const PREFIX = 'cc_ppto_filtro_sesion_'

export function pptoFiltroSesionKey(contratoId) {
  return `${PREFIX}${contratoId}`
}

export function guardarFiltroSesion(contratoId, payload) {
  if (!contratoId) return
  try {
    sessionStorage.setItem(
      pptoFiltroSesionKey(contratoId),
      JSON.stringify({ ...payload, at: Date.now() }),
    )
  } catch { /* ignore */ }
}

export function cargarFiltroSesion(contratoId) {
  if (!contratoId) return null
  try {
    const raw = sessionStorage.getItem(pptoFiltroSesionKey(contratoId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function limpiarFiltroSesion(contratoId) {
  if (!contratoId) return
  try {
    sessionStorage.removeItem(pptoFiltroSesionKey(contratoId))
  } catch { /* ignore */ }
}

/** Al cerrar sesión en la app. */
export function limpiarTodasFiltroSesionPresupuesto() {
  try {
    const keys = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(PREFIX)) keys.push(k)
    }
    keys.forEach((k) => sessionStorage.removeItem(k))
  } catch { /* ignore */ }
}
