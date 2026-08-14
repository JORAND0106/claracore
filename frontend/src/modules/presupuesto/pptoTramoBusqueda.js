/**
 * Helpers del buscador de tramos (Revisor / edición masiva).
 * Formato de sugerencia: `Nodo Inicio · Nodo Fin · Tramo`
 *
 * Fuente: registros de la grilla filtrada (no endpoint externo).
 * Misma unidad lógica que el Revisor: par no_inicio/no_final (+ tramo de la fila).
 */

export function pptoNormTramoCampo(v) {
  const s = String(v ?? '').trim()
  return s || '—'
}

export function pptoTramoOpcionLabel({ noInicio, noFinal, tramo }) {
  return `${pptoNormTramoCampo(noInicio)} · ${pptoNormTramoCampo(noFinal)} · ${pptoNormTramoCampo(tramo)}`
}

/**
 * Opciones únicas a partir de registros de grilla.
 * - Preferente: filas con no_inicio y no_final (como el Revisor de Tramos).
 * - También incluye filas solo con `tramo` (sin nodos) como `— · — · Tramo`.
 *
 * @param {Array<{ no_inicio?: string, no_final?: string, tramo?: string }>} filas
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

/**
 * Une filas de la grilla filtrada con las seleccionadas (por si el filtro
 * client-side dejó fuera alguna fila aún marcada).
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
  // Asegurar filas seleccionadas (resueltas desde registros).
  const idsSel = seleccionados instanceof Set ? [...seleccionados] : [...(seleccionados || [])]
  if (idsSel.length && Array.isArray(registros)) {
    for (const id of idsSel) {
      const r = registros.find((x) => String(x?.id) === String(id))
      if (r) push(r)
    }
  }
  return [...byId.values()]
}

/**
 * Filtra opciones por texto libre en cualquiera de los tres campos (o el label).
 * @param {Array<{ noInicio: string, noFinal: string, tramo: string, label: string }>} opciones
 * @param {string} query
 */
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

/**
 * ¿La fila pertenece a la opción seleccionada?
 */
export function pptoFilaCoincideOpcionTramo(r, opcion) {
  if (!r || !opcion) return false
  const ni = pptoNormTramoCampo(r.no_inicio ?? r.nodo_inicio)
  const nf = pptoNormTramoCampo(r.no_final ?? r.nodo_final)
  const tr = pptoNormTramoCampo(r.tramo)
  return ni === opcion.noInicio && nf === opcion.noFinal && tr === opcion.tramo
}
