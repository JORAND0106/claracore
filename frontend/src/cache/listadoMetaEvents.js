/**
 * Invalidación cruzada cuando cambia la ficha (ítem/desc/unidad) en Listado de Precios.
 * Presupuesto mantiene caché en refs del módulo (8 min); SICOE/Dashboard usan vistaCache.
 */
import { invalidateVistaContrato } from './vistaCache.js'
import { invalidateSicoeVistaCache } from './sicoeVistaCache.js'
import { invalidateDashboardVistaCache } from './dashboardVistaCache.js'

export const CC_LISTADO_META_CHANGED = 'cc-listado-meta-changed'

/**
 * @param {number|string|null|undefined} contratoId
 */
export function notifyListadoMetaChanged(contratoId) {
  if (contratoId == null || contratoId === '') return
  try {
    invalidateVistaContrato(contratoId)
  } catch { /* ignore */ }
  try {
    invalidateSicoeVistaCache(contratoId)
  } catch { /* ignore */ }
  try {
    invalidateDashboardVistaCache(contratoId)
  } catch { /* ignore */ }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent(CC_LISTADO_META_CHANGED, { detail: { contratoId: Number(contratoId) } }),
      )
    }
  } catch { /* ignore */ }
}
