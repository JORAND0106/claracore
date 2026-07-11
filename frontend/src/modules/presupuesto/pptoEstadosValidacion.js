/** Estados y colores compartidos — depuración e interventoría en presupuesto. */

export const PPTO_SEMAFORO_ESTADOS = [
  { valor: 'No Revisado', color: '#3B82F6', label: 'No Revisado' },
  { valor: 'Rechazado', color: '#EF4444', label: 'Rechazado' },
  { valor: 'Pendiente', color: '#F59E0B', label: 'Pendiente' },
  { valor: 'Aprobado', color: '#10B981', label: 'Aprobado' },
]

export function pptoEstadoValidacionColor(estado) {
  const e = String(estado ?? '').trim() || 'No Revisado'
  const hit = PPTO_SEMAFORO_ESTADOS.find((s) => s.valor === e)
  return hit?.color || '#3B82F6'
}

/** Estado depuración normalizado para UI. */
export function pptoEstadoDepuracionDisplay(row) {
  const v = row?.pre_interv_estado
  if (v == null || String(v).trim() === '') return 'No Revisado'
  return String(v).trim()
}

/** Estado interventoría normalizado para UI. */
export function pptoEstadoInterventoriaDisplay(row) {
  const v = row?.revisado
  if (v == null || String(v).trim() === '') return 'No Revisado'
  return String(v).trim()
}

export function pptoEsLegadoDepuracion(row) {
  const v = row?.pre_interv_estado
  return v == null || String(v).trim() === ''
}
