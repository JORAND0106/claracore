/**
 * Z-order del editor de esquema: el índice en `objects` es el apilamiento.
 * Primero se dibuja (fondo); último queda al frente.
 * Toda `image` (fondo fit o pegada) es capa anclada debajo de las entidades editables.
 */

/** Imagen de fondo (inicial fit o pegada): sin interacción con dibujo/hatch. */
export function isBackgroundImage(obj) {
  return !!(obj && obj.type === 'image')
}

export function isAnchoredLayer(obj) {
  return isBackgroundImage(obj)
}

/**
 * Garantiza que las imágenes queden debajo del resto al dibujar/exportar,
 * sin mutar el arreglo original.
 */
export function partitionBackgroundFirst(objects) {
  const list = Array.isArray(objects) ? objects : []
  const bg = []
  const rest = []
  for (const o of list) {
    if (isBackgroundImage(o)) bg.push(o)
    else rest.push(o)
  }
  return bg.length ? [...bg, ...rest] : list
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
