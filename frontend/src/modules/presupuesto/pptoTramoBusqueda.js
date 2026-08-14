/**
 * Helpers del tab / Revisor de Tramos.
 *
 * Lógica del botón «Tramos» (`abrirRevisorTramosObra` + modal):
 * 1) Carga registros con `cargarCapituloData` →
 *    `pptoBuildPresupuestoSearchParams(fObra, …, { capituloOverride })` +
 *    `fetchPresupuestoPaginasCompletas` (`pptoEp().conteo` / `pptoEp().list`).
 * 2) Filtra por capítulo: `registros.filter(r => r.capitulo === cap)`.
 * 3) Agrupa pares únicos: `no_inicio` + `no_final`, ambos truthy y distintos;
 *    key `${no_inicio}||${no_final}`, label `${no_inicio} → ${no_final}`.
 * 4) Registros del tramo: `r.no_inicio === tr.no_inicio && r.no_final === tr.no_final`.
 *
 * No usa maestro-ubicacion-pk para el listado de tramos.
 */

export function pptoNormTramoCampo(v) {
  const s = String(v ?? '').trim()
  return s || '—'
}

export function pptoTramoOpcionLabel({ noInicio, noFinal, tramo }) {
  return `${pptoNormTramoCampo(noInicio)} · ${pptoNormTramoCampo(noFinal)} · ${pptoNormTramoCampo(tramo)}`
}

/**
 * Une filas de la grilla filtrada con las seleccionadas. Omite sellados.
 * (Fallback cuando no hay capítulo / no se pudo cargar vía API.)
 */
export function pptoFilasFuenteTramos({ registrosGrilla, registros, seleccionados, esSellado }) {
  const byId = new Map()
  const push = (r) => {
    if (!r || r.id == null) return
    if (typeof esSellado === 'function' && esSellado(r)) return
    byId.set(String(r.id), r)
  }
  for (const r of registrosGrilla || []) push(r)
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

/**
 * Tramos únicos — misma lógica exacta que el Revisor / botón Tramos.
 * No ordena (mantiene orden de primera aparición).
 *
 * @param {Array<{ no_inicio?: string, no_final?: string }>} filas
 * @returns {Array<{ key: string, no_inicio: string, no_final: string, label: string }>}
 */
export function pptoConstruirTramosUnicos(filas) {
  const tramosUnicos = []
  const vistos = new Set()
  for (const r of filas || []) {
    if (!r?.no_inicio || !r?.no_final) continue
    if (r.no_inicio === r.no_final) continue
    const key = `${r.no_inicio}||${r.no_final}`
    if (vistos.has(key)) continue
    vistos.add(key)
    tramosUnicos.push({
      key,
      no_inicio: r.no_inicio,
      no_final: r.no_final,
      label: `${r.no_inicio} → ${r.no_final}`,
    })
  }
  return tramosUnicos
}

/** Filtra tramos por nodo inicio o nodo fin (buscador del Revisor). */
export function pptoFiltrarTramosUnicos(tramos, query) {
  const list = Array.isArray(tramos) ? tramos : []
  const busq = String(query || '').trim().toLowerCase()
  if (!busq) return list
  return list.filter((tr) => {
    const ni = String(tr.no_inicio || '').toLowerCase()
    const nf = String(tr.no_final || '').toLowerCase()
    return ni.includes(busq) || nf.includes(busq)
  })
}

/**
 * Registros del tramo — mismo criterio que el Revisor (pestaña Tramo):
 * `r.no_inicio === tramo.no_inicio && r.no_final === tramo.no_final`
 */
export function pptoFilasDeTramo(filas, tramo) {
  if (!tramo) return []
  return (filas || []).filter(
    (r) => r.no_inicio === tramo.no_inicio && r.no_final === tramo.no_final,
  )
}

/**
 * Origen del registro respecto a un tramo seleccionado (Revisor):
 * - TR: tramo completo (`no_inicio`→`no_final` del par)
 * - NI: nodo inicio (`no_inicio === no_final === tramo.no_inicio`)
 * - NF: nodo fin (`no_inicio === no_final === tramo.no_final`)
 * @returns {'TR'|'NI'|'NF'|null}
 */
export function pptoOrigenRegistroTramo(r, tramo) {
  if (!r || !tramo) return null
  const ni = tramo.no_inicio
  const nf = tramo.no_final
  if (ni == null || nf == null) return null
  if (r.no_inicio === ni && r.no_final === nf) return 'TR'
  if (r.no_inicio === ni && r.no_final === ni) return 'NI'
  if (r.no_inicio === nf && r.no_final === nf) return 'NF'
  return null
}

/** Estilo badge NI / NF / TR (alineado con pestañas 🔵 / 🔴 / tramo del Revisor). */
export function pptoOrigenTramoBadgeStyle(origen) {
  switch (origen) {
    case 'NI':
      return { bg: '#DBEAFE', color: '#1D4ED8', label: 'NI', title: 'Nodo inicio' }
    case 'NF':
      return { bg: '#FEE2E2', color: '#B91C1C', label: 'NF', title: 'Nodo fin' }
    case 'TR':
      return { bg: '#CCFBF1', color: '#0F766E', label: 'TR', title: 'Tramo completo' }
    default:
      return { bg: '#F1F5F9', color: '#64748B', label: '—', title: '' }
  }
}

/**
 * NI + NF + TR del tramo seleccionado (misma unión conceptual que el Revisor).
 * Orden: NI → TR → NF; dentro de cada grupo, orden de aparición.
 * @returns {Array<{ registro: object, origen: 'NI'|'TR'|'NF' }>}
 */
export function pptoFilasDetalleTramo(filas, tramo) {
  if (!tramo) return []
  const buckets = { NI: [], TR: [], NF: [] }
  for (const r of filas || []) {
    const origen = pptoOrigenRegistroTramo(r, tramo)
    if (!origen) continue
    buckets[origen].push({ registro: r, origen })
  }
  return [...buckets.NI, ...buckets.TR, ...buckets.NF]
}

/** Filtra filas de un capítulo (paso previo del Revisor). */
export function pptoFilasCapituloTramos(filas, capitulo) {
  const cap = String(capitulo || '').trim()
  if (!cap) return Array.isArray(filas) ? [...filas] : []
  return (filas || []).filter((r) => r.capitulo === cap)
}

/** Opciones legacy autocomplete. */
export function pptoConstruirOpcionesTramo(filas) {
  const map = new Map()
  for (const r of filas || []) {
    if (!r || typeof r !== 'object') continue
    const niRaw = String(r.no_inicio ?? '').trim()
    const nfRaw = String(r.no_final ?? '').trim()
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
  const ni = pptoNormTramoCampo(r.no_inicio)
  const nf = pptoNormTramoCampo(r.no_final)
  const tr = pptoNormTramoCampo(r.tramo)
  return ni === opcion.noInicio && nf === opcion.noFinal && tr === opcion.tramo
}
