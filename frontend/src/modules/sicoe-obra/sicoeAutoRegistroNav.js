/**
 * Resolución de `_autoRegistro` al abrir carpeta SICOE (panel / deep-link / notif).
 * El valor puede ser id interno o numero_registro; a veces llega antes que `registros[]`.
 *
 * Interventoría abre con frecuencia desde cola/panel con `_autoRegistro` mientras el
 * detalle aún tiene `registros: []`. Forzar «sin_asignar» en ese instante rompe el
 * despliegue de Ítems/registros (Desarrollador/Operativo suelen abrir sin ese path).
 */
import { normalizarItemNumSicoe } from './sicoeReporteItemsTablaHelpers.js'

export function sicoeMatchRegistroAuto(registros, autoRef) {
  if (autoRef == null || autoRef === '') return null
  const list = Array.isArray(registros) ? registros : []
  const token = String(autoRef)
  const byId = list.find((r) => String(r?.id) === token)
  if (byId) return byId
  const byNum = list.find((r) => String(r?.numero_registro) === token)
  return byNum || null
}

/**
 * Decide pestaña + clave de ítem al resolver _autoRegistro.
 * Si aún no hay registros, no forzar «sin_asignar» (esperar a que cargue el detalle).
 */
export function sicoeAutoRegistroNavState(registros, autoRef) {
  if (autoRef == null || autoRef === '') {
    return { ready: true, tab: null, itemKey: null, registroId: null }
  }
  const list = Array.isArray(registros) ? registros : []
  if (list.length === 0) {
    return { ready: false, tab: null, itemKey: null, registroId: null }
  }
  const reg = sicoeMatchRegistroAuto(list, autoRef)
  if (!reg) {
    return { ready: true, tab: 'sin_asignar', itemKey: null, registroId: null }
  }
  const itemKey = normalizarItemNumSicoe(reg.item_numero)
  if (itemKey) {
    return {
      ready: true,
      tab: 'items',
      itemKey,
      registroId: reg.id ?? null,
    }
  }
  return {
    ready: true,
    tab: 'sin_asignar',
    itemKey: null,
    registroId: reg.id ?? null,
  }
}
