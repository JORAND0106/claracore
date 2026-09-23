/**
 * Helpers UI — Crear reporte SICOE desde planilla de tubería.
 */

/**
 * Filtra capítulos del catálogo SICOE según tipo de planilla.
 * Si no hay match, conserva la lista completa (no vaciar el dropdown).
 */
export function filtrarCapitulosPorTipoPlanilla(capitulos = [], tipoPlanilla = '') {
  const caps = (capitulos || [])
    .map((x) => (typeof x === 'string' ? x : (x?.capitulo || x?.nombre || '')))
    .map((s) => String(s || '').trim())
    .filter(Boolean)
  const tipo = String(tipoPlanilla || '').trim().toUpperCase()
  let keys = []
  if (tipo === 'FILTRO') keys = ['filtro', 'filtros']
  else if (tipo === 'ALCANTARILLA') keys = ['alcantarilla', 'alcantarillado', 'obras de arte']
  else return caps
  const matched = caps.filter((c) => {
    const low = c.toLowerCase()
    return keys.some((k) => low.includes(k))
  })
  return matched.length ? matched : caps
}
