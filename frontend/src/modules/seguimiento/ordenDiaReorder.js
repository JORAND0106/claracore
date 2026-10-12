/**
 * Reordenar puntos del orden del día y alinear temas (od-N) con ese orden.
 */

import { claveOrdenDia, isClaveOrdenDia, seedIdeasFromOrdenDia } from './actaTemasOrdenDia.js'

export function moveOrdenItem(list, fromIdx, toIdx) {
  const arr = Array.isArray(list) ? [...list] : []
  if (fromIdx < 0 || toIdx < 0 || fromIdx >= arr.length || toIdx >= arr.length) return arr
  if (fromIdx === toIdx) return arr
  const [row] = arr.splice(fromIdx, 1)
  arr.splice(toIdx, 0, row)
  return arr
}

/**
 * Tras mover puntos, reasigna ideas od-* por título/_ordenItemKey y reescribe od-1..N.
 * Conserva temas manuales/sueltos al final.
 */
export function realinearIdeasConOrden(ordenItems, ideas, { newRowKey } = {}) {
  const puntos = (Array.isArray(ordenItems) ? ordenItems : [])
    .filter((x) => String(x?.texto || x?.titulo || '').trim())
  const list = Array.isArray(ideas) ? [...ideas] : []
  if (!puntos.length) return list

  const pool = [...list]
  const matched = []
  const used = new Set()

  const takeMatch = (pred) => {
    const idx = pool.findIndex((row, i) => !used.has(i) && pred(row))
    if (idx < 0) return null
    used.add(idx)
    return pool[idx]
  }

  puntos.forEach((p, i) => {
    const titulo = String(p.texto || p.titulo || '').trim()
    const itemKey = String(p.key || p._key || '').trim()
    let idea =
      (itemKey
        ? takeMatch((row) => String(row?._ordenItemKey || '').trim() === itemKey)
        : null)
      || takeMatch((row) => {
        if (!isClaveOrdenDia(row?._claveGrabacion)) return false
        return String(row?.titulo || '').trim().toLowerCase() === titulo.toLowerCase()
      })
      || takeMatch((row) => {
        if (row?._claveGrabacion && !isClaveOrdenDia(row._claveGrabacion)) return false
        return String(row?.titulo || '').trim().toLowerCase() === titulo.toLowerCase()
      })

    const clave = claveOrdenDia(i + 1)
    if (idea) {
      matched.push({
        ...idea,
        _claveGrabacion: clave,
        _desdeOrdenDia: true,
        _ordenItemKey: itemKey || idea._ordenItemKey || null,
        titulo: idea.titulo || titulo,
        quien_dijo: idea.quien_dijo || String(p.expositor_nombre || '').trim(),
      })
    } else {
      matched.push({
        _key: typeof newRowKey === 'function' ? newRowKey('idea') : `idea-${i}`,
        _claveGrabacion: clave,
        _desdeOrdenDia: true,
        _ordenItemKey: itemKey || null,
        _temaAbierto: false,
        titulo,
        quien_dijo: String(p.expositor_nombre || '').trim(),
        texto: '',
        imagenes: [],
      })
    }
  })

  const rest = pool.filter((_, i) => !used.has(i))
  const combined = [...matched, ...rest]
  // Un solo abierto
  let openSeen = false
  return combined.map((row) => {
    if (!row._temaAbierto) return row
    if (openSeen) return { ...row, _temaAbierto: false }
    openSeen = true
    return row
  })
}

/** Atajo: mueve un punto y realinea temas. */
export function moverPuntoOrdenYTemas(ordenItems, ideas, fromIdx, toIdx, opts = {}) {
  const nextOrden = moveOrdenItem(ordenItems, fromIdx, toIdx)
  const nextIdeas = realinearIdeasConOrden(nextOrden, ideas, opts)
  // Asegura claves od-* coherentes también vía seed (idempotente)
  const seeded = seedIdeasFromOrdenDia(nextOrden, nextIdeas, opts)
  return { orden_items: nextOrden, ideas: seeded }
}
