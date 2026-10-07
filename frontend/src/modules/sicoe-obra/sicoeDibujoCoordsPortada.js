/**
 * Precarga / sincronización de la tabla de coordenadas del editor de dibujo
 * con los puntos topográficos de la portada del reporte.
 */
import { normalizarPuntosTopoPortada, numeroTopoONull } from './sicoePortadaTopografia.js'

/**
 * @param {unknown} puntos
 * @returns {{ num: string, norte: number|string, este: number|string, cota: number|string, desc: string }[]}
 */
export function coordRowsDesdePuntosPortada(puntos) {
  if (!Array.isArray(puntos) || !puntos.length) return []
  const out = []
  let auto = 1
  for (const p of puntos) {
    if (!p || typeof p !== 'object') continue
    const norteRaw = p.norte
    const esteRaw = p.este
    const norte = norteRaw === '' || norteRaw == null ? null : Number(norteRaw)
    const este = esteRaw === '' || esteRaw == null ? null : Number(esteRaw)
    if (norte == null && este == null) continue
    if ((norte != null && !Number.isFinite(norte)) || (este != null && !Number.isFinite(este))) continue
    const num = String(p.punto ?? p.num ?? p.nombre ?? '').trim() || String(auto)
    out.push({
      num,
      norte: norte != null && Number.isFinite(norte) ? norte : '',
      este: este != null && Number.isFinite(este) ? este : '',
      cota: p.cota == null || p.cota === '' ? '' : Number.isFinite(Number(p.cota)) ? Number(p.cota) : String(p.cota),
      desc: String(p.descripcion ?? p.desc ?? '').trim(),
    })
    auto += 1
  }
  return out
}

/** Filas con Norte y Este numéricos (las vacías no se guardan ni van a portada). */
export function coordRowsNoVacias(rows) {
  if (!Array.isArray(rows)) return []
  return rows.filter((r) => {
    if (!r || typeof r !== 'object') return false
    const norte = numeroTopoONull(r.norte)
    const este = numeroTopoONull(r.este)
    return norte != null && este != null
  })
}

/**
 * Convierte filas de la tabla del editor a puntos de portada (API).
 * Omite filas vacías.
 */
export function puntosPortadaDesdeCoordRows(rows) {
  const mapped = coordRowsNoVacias(rows).map((r, i) => ({
    punto: String(r.num ?? '').trim() || String(i + 1),
    norte: r.norte,
    este: r.este,
    cota: r.cota,
    descripcion: r.desc ?? r.descripcion,
  }))
  return normalizarPuntosTopoPortada(mapped)
}

/**
 * Agrega (o rellena la primera fila vacía) un nodo tomado del plano.
 * @param {Array<object>|null|undefined} rows
 * @param {{ norte: number, este: number }} gk
 * @returns {{ rows: Array<{ num: string, norte: number, este: number, cota: string, desc: string }>, index: number }}
 */
export function appendCoordRowDesdePlano(rows, gk) {
  const norte = Number(gk?.norte)
  const este = Number(gk?.este)
  if (!Number.isFinite(norte) || !Number.isFinite(este)) {
    const fallback = Array.isArray(rows)
      ? rows.map((r, i) => ({ ...(r || {}), num: String(i + 1) }))
      : []
    return { rows: fallback, index: -1 }
  }
  const list = Array.isArray(rows) ? rows.map((r) => ({ ...(r || {}) })) : []
  const emptyIdx = list.findIndex((r) => (
    numeroTopoONull(r?.norte) == null && numeroTopoONull(r?.este) == null
  ))
  const filled = {
    norte,
    este,
    cota: '',
    desc: '',
  }
  let index
  if (emptyIdx >= 0) {
    list[emptyIdx] = { ...list[emptyIdx], ...filled }
    index = emptyIdx
  } else {
    list.push(filled)
    index = list.length - 1
  }
  return {
    rows: list.map((r, i) => ({ ...r, num: String(i + 1) })),
    index,
  }
}

/** Redondeo típico de campo (mm) al tomar del plano. */
export function redondearCoordGaussDesdePlano(value, decimales = 3) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const f = 10 ** Math.max(0, Number(decimales) || 0)
  return Math.round(n * f) / f
}
