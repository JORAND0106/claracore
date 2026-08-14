/**
 * Helpers del buscador / tab Tramos (Revisor y edición masiva).
 *
 * Unidad lógica del Revisor: par `no_inicio` → `no_final`
 * (ambos presentes y distintos). Fuente: registros de la grilla
 * filtrada / del capítulo — no endpoint de maestro de ubicación.
 */

export function pptoNormTramoCampo(v) {
  const s = String(v ?? '').trim()
  return s || '—'
}

export function pptoTramoOpcionLabel({ noInicio, noFinal, tramo }) {
  return `${pptoNormTramoCampo(noInicio)} · ${pptoNormTramoCampo(noFinal)} · ${pptoNormTramoCampo(tramo)}`
}

/**
 * Une filas de la grilla filtrada con las seleccionadas (por si el filtro
 * client-side dejó fuera alguna fila aún marcada). Omite sellados.
 */
export function pptoFilasFuenteTramos({ registrosGrilla, registros, seleccionados, esSellado }) {
  const byId = new Map()
  const push = (r) => {
    if (!r || r.id == null) return
    if (typeof esSellado === 'function' && esSellado(r)) return
    byId.set(String(r.id), r)
  }
  for (const r of registrosGrilla || []) push(r)
  // Fallback: si la grilla filtrada viene vacía, usar el store completo.
  if (byId.size === 0) {
    for (const r of registros || []) push(r)
  }
  const idsSel = seleccionados instanceof Set ? [...seleccionados] : [...(seleccionados || [])]
  if (idsSel.length && Array.isArray(registros)) {
    for (const id of idsSel) {
      const r = registros.find((x) => String(x?.id) === String(id))
      if (r) push(r)
    }
  }
  return [...byId.values()]
}

function pptoNodosDeFila(r) {
  const no_inicio = String(r?.no_inicio ?? r?.nodo_inicio ?? '').trim()
  const no_final = String(r?.no_final ?? r?.nodo_final ?? '').trim()
  return { no_inicio, no_final }
}

/**
 * Tramos únicos como el Revisor: `Nodo Inicio → Nodo Fin`
 * (ambos nodos presentes y distintos).
 */
export function pptoConstruirTramosUnicos(filas) {
  const vistos = new Set()
  const out = []
  for (const r of filas || []) {
    if (!r || typeof r !== 'object') continue
    const { no_inicio, no_final } = pptoNodosDeFila(r)
    if (!no_inicio || !no_final || no_inicio === no_final) continue
    const key = `${no_inicio}||${no_final}`
    if (vistos.has(key)) continue
    vistos.add(key)
    out.push({
      key,
      no_inicio,
      no_final,
      label: `${no_inicio} → ${no_final}`,
    })
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }))
}

/** Filtra tramos por nodo inicio o nodo fin. Sin query → todos. */
export function pptoFiltrarTramosUnicos(tramos, query) {
  const list = Array.isArray(tramos) ? tramos : []
  const busq = String(query || '').trim().toLowerCase()
  if (!busq) return list
  return list.filter((tr) => {
    const ni = String(tr.no_inicio || '').toLowerCase()
    const nf = String(tr.no_final || '').toLowerCase()
    const lb = String(tr.label || '').toLowerCase()
    return ni.includes(busq) || nf.includes(busq) || lb.includes(busq)
  })
}

/** Registros del tramo (mismo criterio que el Revisor). */
export function pptoFilasDeTramo(filas, tramo) {
  if (!tramo) return []
  const niSel = String(tramo.no_inicio || '').trim()
  const nfSel = String(tramo.no_final || '').trim()
  if (!niSel || !nfSel) return []
  return (filas || []).filter((r) => {
    const { no_inicio, no_final } = pptoNodosDeFila(r)
    return no_inicio === niSel && no_final === nfSel
  })
}

/**
 * Opciones legacy autocomplete: `Nodo · Nodo · Tramo`.
 * Se mantiene por compatibilidad de tests / usos previos.
 */
export function pptoConstruirOpcionesTramo(filas) {
  const map = new Map()
  for (const r of filas || []) {
    if (!r || typeof r !== 'object') continue
    const niRaw = String(r.no_inicio ?? r.nodo_inicio ?? '').trim()
    const nfRaw = String(r.no_final ?? r.nodo_final ?? '').trim()
    const trRaw = String(r.tramo ?? '').trim()
    if (!niRaw && !nfRaw && !trRaw) continue
    const noInicio = niRaw || '—'
    const noFinal = nfRaw || '—'
    const tramo = trRaw || '—'
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

export function pptoFiltrarOpcionesTramo(opciones, query) {
  const list = Array.isArray(opciones) ? opciones : []
  const busq = String(query || '').trim().toLowerCase()
  if (!busq) return list
  return list.filter((op) => {
    const ni = String(op.noInicio || '').toLowerCase()
    const nf = String(op.noFinal || '').toLowerCase()
    const tr = String(op.tramo || '').toLowerCase()
    const lb = String(op.label || '').toLowerCase()
    return ni.includes(busq) || nf.includes(busq) || tr.includes(busq) || lb.includes(busq)
  })
}

export function pptoFilaCoincideOpcionTramo(r, opcion) {
  if (!r || !opcion) return false
  const ni = pptoNormTramoCampo(r.no_inicio ?? r.nodo_inicio)
  const nf = pptoNormTramoCampo(r.no_final ?? r.nodo_final)
  const tr = pptoNormTramoCampo(r.tramo)
  return ni === opcion.noInicio && nf === opcion.noFinal && tr === opcion.tramo
}
