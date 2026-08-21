/** Helpers de visitantes para Reporte de Evento (sin React). */

export function emptyVisitanteRow() {
  return { visitante_id: null, nombre: '', cargo: '' }
}

/**
 * Normaliza visitantes_lista o texto legacy a filas de grilla.
 */
export function visitantesFromDetalle(detalle) {
  if (!detalle || typeof detalle !== 'object') return [emptyVisitanteRow()]
  const lista = detalle.visitantes_lista
  if (Array.isArray(lista) && lista.length) {
    const rows = lista.map((v) => ({
      visitante_id: v?.visitante_id ?? v?.id ?? null,
      nombre: String(v?.nombre || '').trim(),
      cargo: String(v?.cargo || '').trim(),
    })).filter((v) => v.nombre)
    return rows.length ? rows : [emptyVisitanteRow()]
  }
  const texto = String(detalle.visitantes || '').trim()
  if (!texto) return [emptyVisitanteRow()]
  const rows = texto.split(/[,;\n]+/).map((part) => {
    const p = part.trim()
    if (!p) return null
    const m = p.match(/^(.+?)\s*\(([^)]*)\)\s*$/)
    if (m) return { visitante_id: null, nombre: m[1].trim(), cargo: m[2].trim() }
    return { visitante_id: null, nombre: p, cargo: '' }
  }).filter(Boolean)
  return rows.length ? rows : [emptyVisitanteRow()]
}
