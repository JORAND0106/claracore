/**
 * Z-order del editor de esquema: el índice en `objects` es el apilamiento.
 * Primero se dibuja (fondo); último queda al frente. El fondo raster (`image`+fit)
 * permanece anclado debajo de las entidades editables.
 */

export function isAnchoredLayer(obj) {
  return !!(obj && obj.type === 'image' && obj.fit)
}

export function zOrderIds(objects) {
  return (objects || []).map((o) => o?.id)
}

export function zOrderEquals(a, b) {
  const ia = zOrderIds(a)
  const ib = zOrderIds(b)
  return ia.length === ib.length && ia.every((id, i) => id === ib[i])
}

export function canReorderZOrder(objects, selectedIds) {
  const ids = new Set((selectedIds || []).filter(Boolean))
  if (!ids.size) return false
  return (objects || []).some((o) => ids.has(o.id) && !isAnchoredLayer(o))
}

/**
 * @param {object[]} objects
 * @param {string[]} selectedIds
 * @param {'front'|'back'} direction
 * @returns {object[]} mismo arreglo si no hay cambio
 */
export function reorderZOrder(objects, selectedIds, direction) {
  const list = Array.isArray(objects) ? objects : []
  if (!list.length) return list
  const ids = new Set((selectedIds || []).filter(Boolean))
  if (!ids.size) return list

  const anchored = []
  const movable = []
  for (const o of list) {
    if (isAnchoredLayer(o)) anchored.push(o)
    else movable.push(o)
  }

  const selected = []
  const rest = []
  for (const o of movable) {
    if (ids.has(o.id)) selected.push(o)
    else rest.push(o)
  }
  if (!selected.length) return list

  const next = direction === 'front'
    ? [...anchored, ...rest, ...selected]
    : [...anchored, ...selected, ...rest]
  return zOrderEquals(list, next) ? list : next
}
