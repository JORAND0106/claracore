/**
 * Notifica a ClaraGIS / Auditoría / portada que el dibujo de un reporte cambió.
 * Evita geometrías stale en mapa de calor, huellas y referencias.
 */

export const SICOE_DIBUJO_ACTUALIZADO_EVENT = 'sicoe-dibujo-reporte-actualizado'

/**
 * @param {{ contratoId?: any, reporteId?: any, dibujo_geojson?: any, dibujo_escena?: any, puntos?: any[], tiene_dibujo?: boolean }} detail
 */
export function notifyDibujoReporteActualizado(detail = {}) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  const reporteId = detail.reporteId ?? detail.id
  if (reporteId == null) return
  try {
    window.dispatchEvent(
      new CustomEvent(SICOE_DIBUJO_ACTUALIZADO_EVENT, {
        detail: {
          contratoId: detail.contratoId != null ? Number(detail.contratoId) : null,
          reporteId: String(reporteId),
          dibujo_geojson: detail.dibujo_geojson ?? null,
          dibujo_escena: detail.dibujo_escena ?? null,
          puntos: Array.isArray(detail.puntos) ? detail.puntos : null,
          tiene_dibujo: detail.tiene_dibujo !== false,
          ts: Date.now(),
        },
      }),
    )
  } catch {
    /* noop */
  }
}

/** @param {(detail: object) => void} handler */
export function subscribeDibujoReporteActualizado(handler) {
  if (typeof window === 'undefined' || typeof handler !== 'function') {
    return () => {}
  }
  const fn = (ev) => {
    try { handler(ev?.detail || {}) } catch { /* noop */ }
  }
  window.addEventListener(SICOE_DIBUJO_ACTUALIZADO_EVENT, fn)
  return () => {
    try { window.removeEventListener(SICOE_DIBUJO_ACTUALIZADO_EVENT, fn) } catch { /* noop */ }
  }
}
