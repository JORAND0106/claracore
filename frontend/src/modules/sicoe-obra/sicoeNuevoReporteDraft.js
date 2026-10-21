/**
 * Borrador local del asistente «Nuevo reporte» (SicoeObra).
 * Evita pérdida total de datos de campo ante cierre accidental, sesión o red.
 *
 * Reglas (ticket nuevo-reporte-limpio):
 * - «+ Nuevo reporte» siempre abre vacío: no se restaura la clave «nuevo».
 * - Los borradores se retoman solo desde la lista (estado Borrador / reporteInicial).
 * - Al cerrar X/Cancelar se conserva el borrador (local + servidor si aplica).
 */

const KEY_PREFIX = 'cc_sicoe_nuevo_reporte_draft_v1'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function sicoeNuevoReporteDraftKey(contratoId, userId, reporteId = null) {
  const cid = contratoId == null ? 'x' : String(contratoId)
  const uid = userId == null || userId === '' ? 'anon' : String(userId)
  const rid = reporteId == null || reporteId === '' ? 'nuevo' : String(reporteId)
  return `${KEY_PREFIX}:${cid}:${uid}:${rid}`
}

export function sicoeNuevoReporteDraftIsDirty(snap) {
  if (!snap || typeof snap !== 'object') return false
  if (String(snap.descripcion || '').trim()) return true
  if (snap.subSeleccionado?.id) return true
  if (snap.inspSeleccionado?.id) return true
  if (String(snap.capituloSel || '').trim()) return true
  if (String(snap.tipoLocalizacion || '').trim()) return true
  if (Array.isArray(snap.registros) && snap.registros.length > 0) return true
  if (Array.isArray(snap.puntos) && snap.puntos.some((p) =>
    String(p?.punto || '').trim()
    || String(p?.norte || '').trim()
    || String(p?.este || '').trim()
    || String(p?.cota || '').trim()
  )) return true
  if (String(snap.enlacePortadaWizard || '').trim()) return true
  if (snap.borradorId) return true
  const g = snap.graficosPorLote
  if (g && typeof g === 'object') {
    for (const k of Object.keys(g)) {
      if (Array.isArray(g[k]) && g[k].length > 0) return true
    }
  }
  return false
}

export function sicoeNuevoReporteDraftSave(contratoId, userId, snapshot, reporteId = null) {
  if (typeof localStorage === 'undefined') return false
  try {
    const key = sicoeNuevoReporteDraftKey(contratoId, userId, reporteId ?? snapshot?.borradorId)
    if (!sicoeNuevoReporteDraftIsDirty(snapshot)) {
      localStorage.removeItem(key)
      return false
    }
    const payload = {
      ...snapshot,
      _savedAt: Date.now(),
      _contratoId: contratoId,
      _userId: userId,
    }
    localStorage.setItem(key, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export function sicoeNuevoReporteDraftLoad(contratoId, userId, reporteId = null) {
  if (typeof localStorage === 'undefined') return null
  try {
    const key = sicoeNuevoReporteDraftKey(contratoId, userId, reporteId)
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const snap = JSON.parse(raw)
    if (!snap || typeof snap !== 'object') return null
    const age = Date.now() - Number(snap._savedAt || 0)
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) {
      localStorage.removeItem(key)
      return null
    }
    if (!sicoeNuevoReporteDraftIsDirty(snap)) return null
    return snap
  } catch {
    return null
  }
}

export function sicoeNuevoReporteDraftClear(contratoId, userId, reporteId = null) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(sicoeNuevoReporteDraftKey(contratoId, userId, reporteId))
    // También limpia la clave «nuevo» si se creó borrador con id
    if (reporteId != null) {
      localStorage.removeItem(sicoeNuevoReporteDraftKey(contratoId, userId, null))
    }
  } catch { /* noop */ }
}

/**
 * ¿Debe el asistente hidratar el formulario desde localStorage al montar?
 * Solo al retomar un borrador de la lista (reporteInicialId).
 * «+ Nuevo reporte» (sin id) NUNCA restaura la clave «nuevo».
 */
export function sicoeNuevoReporteDebeRestaurarLocal(reporteInicialId = null) {
  return reporteInicialId != null && reporteInicialId !== ''
}

/**
 * Mueve un borrador huérfano de la clave «nuevo» a la clave por id de servidor
 * y limpia «nuevo», para que «+ Nuevo» no lo reabra y el listado lo conserve.
 * Si aún no hay borradorId, el caller debe crearlo en servidor y pasar el id.
 */
export function sicoeNuevoReportePromoverClaveNuevo(contratoId, userId, borradorId) {
  if (borradorId == null || borradorId === '') return false
  const orphan = sicoeNuevoReporteDraftLoad(contratoId, userId, null)
  if (!orphan) {
    // Asegura que no quede clave «nuevo» vacía/sucia
    sicoeNuevoReporteDraftClear(contratoId, userId, null)
    return false
  }
  const snap = { ...orphan, borradorId }
  sicoeNuevoReporteDraftSave(contratoId, userId, snap, borradorId)
  // Solo quita «nuevo»; no borra la clave por id
  try {
    localStorage.removeItem(sicoeNuevoReporteDraftKey(contratoId, userId, null))
  } catch { /* noop */ }
  return true
}

/** Evento para forzar flush antes de logout por inactividad. */
export const SICOE_NUEVO_REPORTE_FLUSH_EVENT = 'cc-sicoe-flush-nuevo-reporte-draft'

export function sicoeNuevoReporteRequestFlush() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(SICOE_NUEVO_REPORTE_FLUSH_EVENT))
  } catch { /* noop */ }
}

/** Etiqueta segura para ítems de subcontratista (nombre | razon_social). */
export function sicoeLabelSubcontratistaLista(s) {
  if (!s || typeof s !== 'object') return ''
  const n = String(s.nombre || s.razon_social || '').trim()
  if (n) return n
  return s.id != null ? `Sub #${s.id}` : ''
}

/** Normaliza filas del API/caché para el selector del wizard. */
export function sicoeNormalizarListaSubcontratistas(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map((s) => {
    if (!s || typeof s !== 'object') return s
    const nombre = sicoeLabelSubcontratistaLista(s)
    return { ...s, nombre }
  }).filter((s) => s && s.id != null)
}

/** Filtra lista sin lanzar si falta nombre. */
export function sicoeFiltrarSubcontratistas(lista, busqueda) {
  const q = String(busqueda || '').trim().toLowerCase()
  const arr = Array.isArray(lista) ? lista : []
  if (!q) return arr
  return arr.filter((s) => sicoeLabelSubcontratistaLista(s).toLowerCase().includes(q))
}
