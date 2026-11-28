/**
 * Inserción de bloques de biblioteca:
 * - libre (clic en el plano) si no hay nodos seleccionados
 * - solo en nodos seleccionados cuando el usuario los marcó
 * Nunca inserta en «todos los nodos» sin selección.
 */
import { instantiateLibraryItem } from './esquemaLibrary.js'
import { instantiateLibraryItemAtRealScale } from './esquemaLibraryScale.js'

/** Nodos seleccionados (para asignar bloques). */
export function selectedNodesFromSelection(objects, selectedIds) {
  const set = selectedIds instanceof Set
    ? selectedIds
    : new Set(Array.isArray(selectedIds) ? selectedIds : [])
  return (objects || []).filter((o) => (
    o
    && o.type === 'nodo'
    && set.has(o.id)
    && Number.isFinite(Number(o.x))
    && Number.isFinite(Number(o.y))
  ))
}

/** ¿El bloque está amarrado a este nodo? (onNodeId o legado por centro). */
export function isBloqueOnNode(bloque, node, epsPx = 3) {
  if (!bloque || bloque.type !== 'bloque' || !node) return false
  if (bloque.onNodeId != null && String(bloque.onNodeId) === String(node.id)) return true
  if (bloque.onNodeNum != null && node.nodeNum != null
    && String(bloque.onNodeNum) === String(node.nodeNum)
    && bloque.fromLibraryOnNode) {
    return true
  }
  if (!bloque.fromLibraryOnNode) return false
  const cx = (Number(bloque.x) || 0) + (Number(bloque.w) || 0) / 2
  const cy = (Number(bloque.y) || 0) + (Number(bloque.h) || 0) / 2
  return Math.hypot(cx - Number(node.x), cy - Number(node.y)) <= epsPx
}

/**
 * Coloca el ítem de biblioteca solo en `nodes`.
 * Sustituye únicamente los bloques previos de esos nodos; el resto queda intacto.
 */
export function applyLibraryItemToSelectedNodes(objects, nodes, item, {
  onPlane = true,
  instantiateAt = null,
} = {}) {
  const list = Array.isArray(nodes) ? nodes.filter(Boolean) : []
  if (!item || !list.length) {
    return { objects: objects || [], placed: [], mode: 'none' }
  }
  const instFn = instantiateAt || (onPlane
    ? instantiateLibraryItemAtRealScale
    : (it, at, extras) => instantiateLibraryItem(it, at).map((b) => ({
      ...b,
      libraryId: it.id,
      libraryNombre: it.nombre,
      scaleLocked: true,
      ...extras,
    })))

  const nodeIdSet = new Set(list.map((n) => n.id))
  const kept = (objects || []).filter((o) => {
    if (!o || o.type !== 'bloque') return true
    if (o.onNodeId != null && nodeIdSet.has(o.onNodeId)) return false
    for (const n of list) {
      if (isBloqueOnNode(o, n)) return false
    }
    return true
  })

  const placed = []
  for (const n of list) {
    const inst = (instFn(item, { x: n.x, y: n.y }, {
      fromLibraryOnNode: true,
      onNodeId: n.id,
      onNodeNum: n.nodeNum,
    }) || []).map((b) => ({
      ...b,
      este: Number.isFinite(Number(n.este)) ? Number(n.este) : b.este,
      norte: Number.isFinite(Number(n.norte)) ? Number(n.norte) : b.norte,
      fromCoordTable: true,
      fromLibraryOnNode: true,
      onNodeId: n.id,
      onNodeNum: n.nodeNum,
      scaleLocked: true,
      libraryId: b.libraryId || item.id,
      libraryNombre: b.libraryNombre || item.nombre,
    }))
    placed.push(...inst)
  }
  return {
    objects: [...kept, ...placed],
    placed,
    mode: 'nodes',
  }
}

/** Modo de inserción: 'nodes' si hay nodos seleccionados; si no, 'free'. */
export function libraryInsertMode(objects, selectedIds) {
  const nodes = selectedNodesFromSelection(objects, selectedIds)
  return nodes.length ? 'nodes' : 'free'
}
