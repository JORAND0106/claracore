/**
 * Helpers del buscador de tramos (Revisor / edición masiva).
 * Formato de sugerencia: `Nodo Inicio · Nodo Fin · Tramo`
 */

export function pptoNormTramoCampo(v) {
  const s = String(v ?? '').trim()
  return s || '—'
}

export function pptoTramoOpcionLabel({ noInicio, noFinal, tramo }) {
  return `${pptoNormTramoCampo(noInicio)} · ${pptoNormTramoCampo(noFinal)} · ${pptoNormTramoCampo(tramo)}`
}

/**
 * Opciones únicas a partir de registros (nodo inicio / nodo fin / tramo).
 * @param {Array<{ no_inicio?: string, no_final?: string, tramo?: string }>} filas
 */
export function pptoConstruirOpcionesTramo(filas) {
  const map = new Map()
  for (const r of filas || []) {
    const noInicio = pptoNormTramoCampo(r?.no_inicio)
    const noFinal = pptoNormTramoCampo(r?.no_final)
    const tramo = pptoNormTramoCampo(r?.tramo)
    // Sin nodos ni tramo útiles → omitir
    if (noInicio === '—' && noFinal === '—' && tramo === '—') continue
    const key = `${noInicio}\u0000${noFinal}\u0000${tramo}`
    if (map.has(key)) continue
    map.set(key, {
      key,
      noInicio,
      noFinal,
      tramo,
      label: pptoTramoOpcionLabel({ noInicio, noFinal, tramo }),
    })
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
}

/**
 * Filtra opciones por texto libre en cualquiera de los tres campos (o el label).
 * @param {Array<{ noInicio: string, noFinal: string, tramo: string, label: string }>} opciones
 * @param {string} query
 */
export function pptoFiltrarOpcionesTramo(opciones, query) {
  const busq = String(query || '').trim().toLowerCase()
  if (!busq) return opciones || []
  return (opciones || []).filter((op) => {
    const ni = String(op.noInicio || '').toLowerCase()
    const nf = String(op.noFinal || '').toLowerCase()
    const tr = String(op.tramo || '').toLowerCase()
    const lb = String(op.label || '').toLowerCase()
    return ni.includes(busq) || nf.includes(busq) || tr.includes(busq) || lb.includes(busq)
  })
}

/**
 * ¿La fila pertenece a la opción seleccionada?
 */
export function pptoFilaCoincideOpcionTramo(r, opcion) {
  if (!r || !opcion) return false
  return (
    pptoNormTramoCampo(r.no_inicio) === opcion.noInicio
    && pptoNormTramoCampo(r.no_final) === opcion.noFinal
    && pptoNormTramoCampo(r.tramo) === opcion.tramo
  )
}
