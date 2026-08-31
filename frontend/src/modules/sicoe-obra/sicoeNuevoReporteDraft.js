/**
 * Borrador local del asistente «Nuevo reporte» (SicoeObra).
 * Evita pérdida total de datos de campo ante cierre accidental, sesión o red.
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

/** Evento para forzar flush antes de logout por inactividad. */
export const SICOE_NUEVO_REPORTE_FLUSH_EVENT = 'cc-sicoe-flush-nuevo-reporte-draft'

export function sicoeNuevoReporteRequestFlush() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(SICOE_NUEVO_REPORTE_FLUSH_EVENT))
  } catch { /* noop */ }
}
