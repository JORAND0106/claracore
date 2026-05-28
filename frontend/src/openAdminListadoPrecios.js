/** ¿Puede editar ítems en Listado de Precios? (misma regla que AdminPanel). */
export function permisoEditarListadoPrecios(usuario) {
  if (!usuario) return false
  const cargo = (usuario.cargo_nombre || '').trim().toLowerCase()
  if (cargo === 'desarrollador' || cargo === 'administrador') return true
  const p = (usuario?.permisos || []).find(
    (x) => x.funcion_nombre?.toLowerCase() === 'listado de precios',
  )
  return !!(p?.editar)
}

/**
 * Abre Panel admin → Listado de Precios para el contrato indicado.
 * @param {object} [options]
 * @param {'lista'|'wbs'} [options.modoVista] — p. ej. 'wbs' para Programación WBS
 */
export function openAdminListadoPrecios(contratoId, options = {}) {
  const cid = contratoId != null ? String(contratoId).trim() : ''
  if (!cid) return
  const modoVista = options.modoVista === 'wbs' ? 'wbs' : undefined
  const payload = { tab: 'precios', contratoId: cid, ...(modoVista ? { modoVista } : {}) }
  try {
    sessionStorage.setItem('cc_admin_nav', JSON.stringify(payload))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('cc-open-admin', { detail: payload }))
}

/** Lee y limpia navegación pendiente al panel admin. */
export function consumeAdminNavIntent() {
  try {
    const raw = sessionStorage.getItem('cc_admin_nav')
    if (!raw) return null
    sessionStorage.removeItem('cc_admin_nav')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}
