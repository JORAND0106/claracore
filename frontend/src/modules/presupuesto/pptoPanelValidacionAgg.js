/** Estados Interventoría (semáforo) en presupuesto — columnas del panel dinámico. */
export const PPTO_PANEL_ESTADOS = [
  { key: 'No Revisado', label: 'No revisados', color: '#3B82F6' },
  { key: 'Aprobado', label: 'Aprobados', color: '#10B981' },
  { key: 'Pendiente', label: 'Pendientes', color: '#EAB308' },
  { key: 'Rechazado', label: 'Rechazados', color: '#EF4444' },
]

const ESTADO_KEYS = new Set(PPTO_PANEL_ESTADOS.map((e) => e.key))

export function pptoNormEstadoRevisado(r) {
  const v = String(r?.revisado ?? 'No Revisado').trim()
  return ESTADO_KEYS.has(v) ? v : 'No Revisado'
}

function emptyCeldas() {
  return Object.fromEntries(PPTO_PANEL_ESTADOS.map((e) => [e.key, { count: 0, costo: 0 }]))
}

function addCelda(celdas, estado, costo) {
  const slot = celdas[estado] || { count: 0, costo: 0 }
  slot.count += 1
  slot.costo += costo
  celdas[estado] = slot
}

/**
 * Agrupa registros por capítulo o por ítem (dentro de un capítulo).
 * @param {Array} registros — misma fuente que la grilla (registrosFiltrados)
 * @param {'capitulo'|'item'} nivel
 * @param {string|null} capituloFijo — si nivel item, solo ese capítulo
 * @param {string[]} ordenCapitulos — orden WBS desde resumen de capítulos
 */
export function pptoPanelAgruparValidacion(registros, nivel, capituloFijo = null, ordenCapitulos = []) {
  const map = new Map()
  for (const r of registros || []) {
    const cap = String(r.capitulo ?? '').trim() || '(sin capítulo)'
    if (capituloFijo != null && cap !== capituloFijo) continue
    const item = String(r.item ?? '').trim() || '(sin ítem)'
    const label = nivel === 'item' ? item : cap
    const key = nivel === 'item' ? `${cap}\x1f${item}` : cap
    if (!map.has(key)) {
      const desc = nivel === 'item' ? String(r.descripcion ?? '').trim() : ''
      map.set(key, {
        key,
        label,
        capitulo: cap,
        item: nivel === 'item' ? item : null,
        descripcion: desc,
        und: nivel === 'item' ? (String(r.und ?? '').trim() || null) : null,
        cantTotal: 0,
        celdas: emptyCeldas(),
        totalRegs: 0,
        totalCosto: 0,
      })
    }
    const row = map.get(key)
    if (nivel === 'item' && !row.descripcion && r.descripcion) {
      row.descripcion = String(r.descripcion).trim()
    }
    const cd = Number(r.costo_directo) || 0
    const ct = Number(r.cant_total) || 0
    const est = pptoNormEstadoRevisado(r)
    addCelda(row.celdas, est, cd)
    row.totalRegs += 1
    row.totalCosto += cd
    if (nivel === 'item') row.cantTotal += ct
  }

  const ordenSet = new Map((ordenCapitulos || []).map((c, i) => [String(c.capitulo ?? c), i]))
  const rows = [...map.values()]
  for (const row of rows) {
    const nr = row.celdas['No Revisado']?.count || 0
    row.pendientesValidar = nr
    row.pctValidado = row.totalRegs
      ? Math.round(((row.totalRegs - nr) / row.totalRegs) * 100)
      : 100
  }
  rows.sort((a, b) => {
    if (a.pctValidado !== b.pctValidado) return a.pctValidado - b.pctValidado
    if (nivel === 'capitulo') {
      const ia = ordenSet.has(a.label) ? ordenSet.get(a.label) : 9999
      const ib = ordenSet.has(b.label) ? ordenSet.get(b.label) : 9999
      if (ia !== ib) return ia - ib
    }
    return a.label.localeCompare(b.label, 'es', { numeric: true })
  })
  return rows
}

/** % de registros ya movidos fuera de «No Revisado» (vista actual del panel). */
export function pptoPanelAvanceGlobal(filas) {
  let total = 0
  let pendientes = 0
  let filasIncompletas = 0
  for (const g of filas || []) {
    total += g.totalRegs || 0
    const p = g.pendientesValidar ?? g.celdas?.['No Revisado']?.count ?? 0
    pendientes += p
    if ((g.pctValidado ?? 0) < 100) filasIncompletas += 1
  }
  const validados = Math.max(0, total - pendientes)
  const pct = total > 0 ? Math.round((validados / total) * 100) : 0
  return { pct, total, validados, pendientes, filasIncompletas, filas: (filas || []).length }
}

export function pptoPanelTotalesFilas(filas) {
  const tot = { totalRegs: 0, totalCosto: 0, celdas: emptyCeldas() }
  for (const g of filas || []) {
    tot.totalRegs += g.totalRegs
    tot.totalCosto += g.totalCosto
    for (const e of PPTO_PANEL_ESTADOS) {
      const c = g.celdas[e.key]
      if (!c) continue
      tot.celdas[e.key].count += c.count
      tot.celdas[e.key].costo += c.costo
    }
  }
  return tot
}
