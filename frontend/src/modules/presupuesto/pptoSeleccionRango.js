/**
 * IDs a marcar en selección por rango (Shift+clic), en el orden visual de la lista.
 * Omite filas selladas. Si el ancla o el destino no están en la lista, devuelve solo el destino
 * (si no está sellado).
 *
 * @param {Array<{ id: number|string }>} lista orden visible (p. ej. registrosPagina)
 * @param {number|string|null|undefined} anchorId último marcado individualmente
 * @param {number|string} targetId fila del Shift+clic
 * @param {(row: object) => boolean} [esSellado]
 * @returns {Array<number|string>}
 */
export function idsRangoSeleccion(lista, anchorId, targetId, esSellado = () => false) {
  const rows = Array.isArray(lista) ? lista : []
  const i2 = rows.findIndex((r) => r?.id === targetId)
  if (i2 < 0) return []

  const i1 = anchorId == null ? -1 : rows.findIndex((r) => r?.id === anchorId)
  if (i1 < 0) {
    return esSellado(rows[i2]) ? [] : [rows[i2].id]
  }

  const lo = Math.min(i1, i2)
  const hi = Math.max(i1, i2)
  const out = []
  for (let i = lo; i <= hi; i += 1) {
    const row = rows[i]
    if (!row || esSellado(row)) continue
    out.push(row.id)
  }
  return out
}
