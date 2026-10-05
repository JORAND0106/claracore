/**
 * Color estándar fijo por ítem de contrato (misma clave → mismo color en todos los planos).
 * Paleta contrastada en temas claros y oscuros; no depende del color con que el usuario dibujó.
 */

/** Neutro único cuando un dibujo representa varios ítems a la vez. */
export const SICOE_ITEM_COLOR_NEUTRO = '#64748b'

/**
 * Paleta fija (orden estable). Tonos con saturación media-alta y luminosidad ~42–52%
 * para leerse sobre mapa claro/oscuro sin confundirse con eje (#0ea5e9) ni alerta (#dc2626).
 */
export const SICOE_ITEM_PALETA = Object.freeze([
  '#0d9488', // teal
  '#c026d3', // fuchsia
  '#ea580c', // orange
  '#2563eb', // blue
  '#65a30d', // lime
  '#db2777', // pink
  '#7c3aed', // violet
  '#ca8a04', // amber
  '#0891b2', // cyan
  '#b45309', // brown-orange
  '#4f46e5', // indigo
  '#15803d', // green
  '#be123c', // rose
  '#0369a1', // sky-dark
  '#a16207', // yellow-brown
  '#6d28d9', // purple
  '#0f766e', // teal-dark
  '#c2410c', // orange-dark
  '#1d4ed8', // blue-dark
  '#a21caf', // magenta
  '#3f6212', // olive
  '#9f1239', // crimson
  '#115e59', // teal-deep
  '#7e22ce', // purple-mid
])

function hashItemKey(item) {
  const s = String(item ?? '').trim()
  if (!s) return 0
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Color estándar del ítem (vacío → neutro). */
export function colorEstandarItem(itemNumero) {
  const key = String(itemNumero ?? '').trim()
  if (!key) return SICOE_ITEM_COLOR_NEUTRO
  const idx = hashItemKey(key) % SICOE_ITEM_PALETA.length
  return SICOE_ITEM_PALETA[idx]
}

/**
 * Color para un dibujo según los ítems que representa.
 * Un ítem → color del ítem; varios → neutro; ninguno → neutro.
 * @param {string|number|Array<string|number>|null|undefined} items
 */
export function colorDibujoPorItems(items) {
  const list = Array.isArray(items)
    ? items.map((x) => String(x ?? '').trim()).filter(Boolean)
    : String(items ?? '').trim()
      ? [String(items).trim()]
      : []
  const unique = [...new Set(list)]
  if (unique.length === 1) return colorEstandarItem(unique[0])
  return SICOE_ITEM_COLOR_NEUTRO
}

/**
 * Entradas de leyenda (ítem → color), ordenadas por ítem.
 * @param {Iterable<string|number>} itemNumeros
 */
export function leyendaColoresItems(itemNumeros) {
  const keys = [...new Set(
    [...(itemNumeros || [])]
      .map((x) => String(x ?? '').trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  return keys.map((item) => ({
    item_numero: item,
    color: colorEstandarItem(item),
  }))
}
