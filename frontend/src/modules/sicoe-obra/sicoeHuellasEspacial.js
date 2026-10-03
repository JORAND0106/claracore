/**
 * Sugerencia y helpers de geometría reportada (punto / línea / área).
 */
export function sugerirGeometriaTipo(registro = {}, nCoords = 0) {
  if (nCoords >= 3) return 'area'
  if (nCoords === 2) return 'linea'
  const unidad = String(registro?.unidad || '')
    .trim()
    .toLowerCase()
    .replace('²', '2')
  if (unidad.includes('m2') || unidad === 'm²') return 'area'
  if (['un', 'und', 'u', 'unidad', 'unid', 'und.'].includes(unidad)) return 'punto'
  if (unidad.includes('ml') || unidad === 'm' || unidad === 'ml.') return 'linea'
  if (registro?.abs_inicio != null && registro?.abs_final != null) return 'linea'
  return 'punto'
}

export function normalizarGeometriaTipo(raw, registro, nCoords = 0) {
  const t = String(raw || '').trim().toLowerCase()
  if (['punto', 'point', 'nodo'].includes(t)) return 'punto'
  if (['linea', 'línea', 'line', 'franja'].includes(t)) return 'linea'
  if (['area', 'área', 'poligono', 'polígono', 'polygon'].includes(t)) return 'area'
  return sugerirGeometriaTipo(registro, nCoords)
}
