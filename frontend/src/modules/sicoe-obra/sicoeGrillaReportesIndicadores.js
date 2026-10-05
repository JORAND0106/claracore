/**
 * Indicadores visuales de la grilla de reportes SicoeObra:
 * - resalte gris (sin dibujo)
 * - clip de adjuntos (existente)
 * - icono de planilla de topografía vinculada
 */

export const SICOE_PLANILLA_TOPO_GRILLA_EVENT = 'sicoe-planilla-topo-grilla'
const SICOE_PLANILLA_TOPO_PENDING_KEY = 'sicoe_planilla_topo_grilla_pending'

/** True si el color de fondo se percibe oscuro (tema dark). */
export function esFondoOscuroTema(t) {
  const hex = String(t?.bgCard || t?.bg || '#ffffff').trim()
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return false
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140
}

/**
 * Gris un poco oscuro para filas sin dibujo — legible en light / dark / rest.
 * @returns {{ background: string, backgroundHover: string, border: string, swatchBg: string }}
 */
export function coloresSinDibujoGrilla(t) {
  const dark = esFondoOscuroTema(t)
  if (dark) {
    return {
      background: 'rgba(148, 163, 184, 0.18)',
      backgroundHover: 'rgba(148, 163, 184, 0.28)',
      border: '#94a3b8',
      swatchBg: 'rgba(148, 163, 184, 0.30)',
    }
  }
  return {
    background: 'rgba(71, 85, 105, 0.12)',
    backgroundHover: 'rgba(71, 85, 105, 0.20)',
    border: '#475569',
    swatchBg: 'rgba(71, 85, 105, 0.18)',
  }
}

/** Color del icono de planilla (distinto del clip, que usa primary). */
export function colorIconoPlanillaTopo(t) {
  return esFondoOscuroTema(t) ? '#5eead4' : '#0f766e'
}

export function reporteTienePlanillaTopografia(reporte) {
  if (!reporte || typeof reporte !== 'object') return false
  return reporte.tiene_planilla_topografia === true
}

function _leerPendingPlanillaTopo() {
  try {
    if (typeof sessionStorage === 'undefined') return []
    const raw = sessionStorage.getItem(SICOE_PLANILLA_TOPO_PENDING_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function _guardarPendingPlanillaTopo(list) {
  try {
    if (typeof sessionStorage === 'undefined') return
    if (!list.length) {
      sessionStorage.removeItem(SICOE_PLANILLA_TOPO_PENDING_KEY)
      return
    }
    sessionStorage.setItem(SICOE_PLANILLA_TOPO_PENDING_KEY, JSON.stringify(list.slice(-80)))
  } catch {
    /* noop */
  }
}

/** Guarda un cambio de vínculo para aplicarlo cuando la grilla SICOE vuelva a montarse. */
export function stashPlanillaTopoGrillaPatch(detail = {}) {
  const reporteIds = Array.isArray(detail.reporteIds)
    ? detail.reporteIds.filter((id) => id != null && String(id).trim() !== '').map(String)
    : []
  if (!reporteIds.length) return
  const entry = {
    contratoId: detail.contratoId != null ? Number(detail.contratoId) : null,
    reporteIds,
    tiene: detail.tiene !== false,
    at: Date.now(),
  }
  const prev = _leerPendingPlanillaTopo().filter((x) => x && typeof x === 'object')
  _guardarPendingPlanillaTopo([...prev, entry])
}

/**
 * Aplica el evento de vínculo planilla a la lista de reportes de la grilla.
 * @returns {Array} misma referencia si no hay cambios
 */
export function aplicarPlanillaTopoEnReportes(reportes, detail, contratoIdActual) {
  const list = Array.isArray(reportes) ? reportes : []
  if (!detail || !Array.isArray(detail.reporteIds) || !detail.reporteIds.length) return list
  if (
    detail.contratoId != null
    && contratoIdActual != null
    && Number(detail.contratoId) !== Number(contratoIdActual)
  ) {
    return list
  }
  const wanted = new Set(detail.reporteIds.map(String))
  const tiene = detail.tiene !== false
  let changed = false
  const next = list.map((r) => {
    if (!r || !wanted.has(String(r.id))) return r
    if (r.tiene_planilla_topografia === tiene) return r
    changed = true
    return { ...r, tiene_planilla_topografia: tiene }
  })
  return changed ? next : list
}

/**
 * Aplica y limpia parches pendientes (p. ej. tras asociar en Topografía y volver a SICOE).
 * @returns {Array}
 */
export function aplicarPendingPlanillaTopoEnReportes(reportes, contratoIdActual) {
  const pending = _leerPendingPlanillaTopo()
  if (!pending.length) return Array.isArray(reportes) ? reportes : []
  let list = Array.isArray(reportes) ? reportes : []
  const kept = []
  for (const detail of pending) {
    if (
      detail.contratoId != null
      && contratoIdActual != null
      && Number(detail.contratoId) !== Number(contratoIdActual)
    ) {
      kept.push(detail)
      continue
    }
    list = aplicarPlanillaTopoEnReportes(list, detail, contratoIdActual)
  }
  _guardarPendingPlanillaTopo(kept)
  return list
}

/**
 * Notifica a la grilla SICOE que el vínculo planilla↔reporte cambió
 * (crear, asociar o eliminar planilla) sin recargar la página.
 * @param {{ contratoId?: number|string, reporteIds?: Array<number|string>, tiene?: boolean }} detail
 */
export function notifyPlanillaTopoGrillaChanged(detail = {}) {
  stashPlanillaTopoGrillaPatch(detail)
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  const reporteIds = Array.isArray(detail.reporteIds)
    ? detail.reporteIds.filter((id) => id != null && String(id).trim() !== '')
    : []
  if (!reporteIds.length) return
  try {
    window.dispatchEvent(
      new CustomEvent(SICOE_PLANILLA_TOPO_GRILLA_EVENT, {
        detail: {
          contratoId: detail.contratoId != null ? Number(detail.contratoId) : null,
          reporteIds: reporteIds.map((id) => String(id)),
          tiene: detail.tiene !== false,
        },
      }),
    )
  } catch {
    /* noop */
  }
}
