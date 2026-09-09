/**
 * Helpers puros — asignación de subcontratista en edición masiva de Presupuesto.
 */

/** Texto del tooltip de ayuda en pestaña Tramos. */
export const PPTO_TRAMOS_COMPETENCIA_AYUDA =
  'Asigna la competencia por tramo: selecciona un tramo y todas las cantidades que pertenezcan a él heredarán automáticamente la competencia correspondiente.'

/**
 * Normaliza listado API → opciones de dropdown { id, label }.
 * @param {unknown} rows
 * @returns {{ id: number, label: string }[]}
 */
export function pptoNormalizarSubcontratistasOpciones(rows) {
  if (!Array.isArray(rows)) return []
  const out = []
  const seen = new Set()
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    const id = Number(r.id)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    if (r.activo === false) continue
    const label = String(r.razon_social || r.nombre || '').trim() || `Subcontratista #${id}`
    seen.add(id)
    out.push({ id, label })
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
}

/**
 * Label para un id dado el catálogo de opciones.
 * @param {number|string|null|undefined} id
 * @param {{ id: number, label: string }[]} opciones
 */
export function pptoLabelSubcontratista(id, opciones = []) {
  if (id == null || id === '') return '—'
  const n = Number(id)
  const hit = (opciones || []).find((o) => Number(o.id) === n)
  return hit?.label || `#${n}`
}
