/**
 * Avance de tarea personal a partir del estado de cada sub-ítem del checklist.
 * - Peso equitativo entre sub-ítems no cancelados
 * - Cancelados fuera del numerador y del denominador
 * - 100% ⇒ tarea cumplida
 */

export const ESTADOS_SUBITEM = [
  'abierto',
  'en_progreso',
  'parcial',
  'reprogramado',
  'cumplido',
  'vencido',
  'cancelado',
]

export function normEstadoSubitem(raw, { hecho = false } = {}) {
  const e = String(raw || '').trim().toLowerCase()
  if (ESTADOS_SUBITEM.includes(e)) return e
  if (hecho) return 'cumplido'
  return 'abierto'
}

export function checklistItems(itemOrList) {
  if (Array.isArray(itemOrList)) return itemOrList
  const libres = itemOrList?.campos_libres && typeof itemOrList.campos_libres === 'object'
    ? itemOrList.campos_libres
    : {}
  return Array.isArray(libres.checklist) ? libres.checklist : []
}

/**
 * @returns {{ pct: number|null, validos: number, cumplidos: number, estadoTarea: string }}
 */
export function calcularAvanceTarea(itemOrChecklist) {
  const items = checklistItems(itemOrChecklist)
  const validos = items.filter((it) => normEstadoSubitem(it?.estado_gestion, { hecho: !!it?.hecho }) !== 'cancelado')
  if (!items.length) {
    return { pct: null, validos: 0, cumplidos: 0, estadoTarea: 'abierto' }
  }
  if (!validos.length) {
    return { pct: null, validos: 0, cumplidos: 0, estadoTarea: 'cancelado' }
  }
  const cumplidos = validos.filter((it) => normEstadoSubitem(it.estado_gestion, { hecho: !!it.hecho }) === 'cumplido').length
  const pct = Math.round((100 * cumplidos) / validos.length)
  let estadoTarea = 'abierto'
  if (pct >= 100) estadoTarea = 'cumplido'
  else if (cumplidos > 0) estadoTarea = 'parcial'
  else if (validos.some((it) => ['en_progreso', 'parcial', 'reprogramado', 'vencido'].includes(normEstadoSubitem(it.estado_gestion, { hecho: !!it.hecho })))) {
    estadoTarea = 'en_progreso'
  }
  return { pct, validos: validos.length, cumplidos, estadoTarea }
}

export function labelAvance(avance) {
  if (!avance || avance.pct == null) return '—'
  return `${avance.pct}%`
}
