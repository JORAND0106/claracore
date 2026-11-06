/**
 * Chips rápidos de estado en la grilla de solicitudes.
 *
 * Definición (aplica a la solicitud / sus líneas; la columna OC sigue con números de OC):
 * - borrador / enviada / aprobada / rechazada → almacen_solicitud.estado
 * - oc_parcial → flag de grilla (líneas fuera de OC o enviada con OC)
 * - con_oc → tiene al menos una orden de compra
 */
export const SOLICITUD_ESTADO_CHIPS = [
  { id: 'todas', label: 'Todas', color: '#64748b', kind: 'all' },
  { id: 'borrador', label: 'Borrador', color: '#64748b', kind: 'db' },
  { id: 'enviada', label: 'Enviadas', color: '#2563eb', kind: 'db' },
  { id: 'aprobada', label: 'Aprobadas', color: '#059669', kind: 'db' },
  { id: 'rechazada', label: 'Rechazadas', color: '#dc2626', kind: 'db' },
  { id: 'oc_parcial', label: 'OC parcial', color: '#d97706', kind: 'flag' },
  { id: 'con_oc', label: 'Con OC', color: '#7c3aed', kind: 'flag' },
]

export const EMPTY_ESTADO_COUNTS = {
  todas: 0,
  borrador: 0,
  enviada: 0,
  aprobada: 0,
  rechazada: 0,
  oc_parcial: 0,
  con_oc: 0,
}

/** Toggle: clic en el mismo chip lo quita; se pueden combinar varios (excepto Todas). */
export function toggleEstadoChip(selected, chipId) {
  const cur = Array.isArray(selected) ? [...selected] : []
  if (chipId === 'todas') return []
  const i = cur.indexOf(chipId)
  if (i >= 0) {
    cur.splice(i, 1)
    return cur
  }
  return [...cur, chipId]
}

export function chipsToListQuery(selected) {
  const set = new Set(Array.isArray(selected) ? selected : [])
  const estados = ['borrador', 'enviada', 'aprobada', 'rechazada'].filter((e) => set.has(e))
  return {
    estados,
    con_oc: set.has('con_oc') || undefined,
    oc_parcial: set.has('oc_parcial') || undefined,
  }
}

export function labelChipActivos(selected) {
  if (!selected?.length) return ''
  const map = Object.fromEntries(SOLICITUD_ESTADO_CHIPS.map((c) => [c.id, c.label]))
  return selected.map((id) => map[id] || id).join(', ')
}
