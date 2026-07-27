/**
 * Avance de tarea personal a partir del estado de cada sub-ítem del checklist.
 * - Peso equitativo entre sub-ítems no cancelados
 * - Cancelados fuera del numerador y del denominador
 * - 100% ⇒ tarea cumplida
 * - Sub-ítem con asignaciones[]: solo cuenta cumplido si todos confirmaron
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

export function agregarEstadosAsignados(estados) {
  const norms = (estados || []).map((e) => normEstadoSubitem(e))
  if (!norms.length) return 'abierto'
  if (norms.every((e) => e === 'cancelado')) return 'cancelado'
  const activos = norms.filter((e) => e !== 'cancelado')
  if (!activos.length) return 'cancelado'
  if (activos.every((e) => e === 'cumplido')) return 'cumplido'
  if (activos.some((e) => e === 'cumplido')) return 'parcial'
  if (activos.some((e) => ['en_progreso', 'parcial', 'reprogramado', 'vencido'].includes(e))) {
    return 'en_progreso'
  }
  return 'abierto'
}

export function estadoEfectivoSubitem(it) {
  const asigns = Array.isArray(it?.asignaciones) ? it.asignaciones : []
  if (asigns.length) {
    return agregarEstadosAsignados(asigns.map((a) => a?.estado_gestion))
  }
  return normEstadoSubitem(it?.estado_gestion, { hecho: !!it?.hecho })
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
  const estados = items.map((it) => estadoEfectivoSubitem(it))
  const validosIdx = estados.map((e, i) => (e !== 'cancelado' ? i : -1)).filter((i) => i >= 0)
  if (!items.length) {
    return { pct: null, validos: 0, cumplidos: 0, estadoTarea: 'abierto' }
  }
  if (!validosIdx.length) {
    return { pct: null, validos: 0, cumplidos: 0, estadoTarea: 'cancelado' }
  }
  const cumplidos = validosIdx.filter((i) => estados[i] === 'cumplido').length
  const pct = Math.round((100 * cumplidos) / validosIdx.length)
  let estadoTarea = 'abierto'
  if (pct >= 100) estadoTarea = 'cumplido'
  else if (cumplidos > 0 || validosIdx.some((i) => estados[i] === 'parcial')) estadoTarea = 'parcial'
  else if (validosIdx.some((i) => ['en_progreso', 'reprogramado', 'vencido'].includes(estados[i]))) {
    estadoTarea = 'en_progreso'
  }
  return { pct, validos: validosIdx.length, cumplidos, estadoTarea }
}

export function labelAvance(avance) {
  if (!avance || avance.pct == null) return '—'
  return `${avance.pct}%`
}
