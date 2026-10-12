/**
 * Rango por defecto de Gestión de obra: los 7 días anteriores a la fecha del acta.
 */

export function addDaysIso(iso, days) {
  const s = String(iso || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Semana inmediatamente anterior a fechaReunion (hasta = reunión−1, desde = hasta−6). */
export function rangoSemanaAnterior(fechaReunion) {
  const fr = String(fechaReunion || '').slice(0, 10)
  const base = /^\d{4}-\d{2}-\d{2}$/.test(fr)
    ? fr
    : new Date().toISOString().slice(0, 10)
  const hasta = addDaysIso(base, -1)
  const desde = addDaysIso(hasta, -6)
  return { fecha_desde: desde, fecha_hasta: hasta }
}

export const GESTION_OBRA_SECCIONES = [
  { id: 'personal_jornada', label: 'Personal y jornada' },
  { id: 'cantidades_obra', label: 'Cantidades de obra' },
  { id: 'actividades', label: 'Actividades adicionales' },
  { id: 'almacen', label: 'Almacén' },
  { id: 'programacion', label: 'Programación de obra' },
]

export function emptyObservacionesGestionObra() {
  const out = {}
  for (const s of GESTION_OBRA_SECCIONES) out[s.id] = ''
  return out
}
