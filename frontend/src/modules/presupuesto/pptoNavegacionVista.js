/**
 * Extrae la vista anterior del stack de navegación del panel/grilla Presupuesto.
 *
 * Convención del stack:
 * - Tras `aplicarFiltroObraConF` con push al final, el tope es la vista *actual*.
 * - Tras un drill que solo empuja la vista previa, el tope es la vista *anterior*.
 */
export function pptoPopVistaAnterior(stack) {
  if (!Array.isArray(stack) || stack.length === 0) return null
  if (stack.length > 1) {
    stack.pop()
    return stack[stack.length - 1] || null
  }
  return stack.pop() || null
}

/** Suma cant_total y costo_directo de filas cuyo id está en `seleccionados`. */
export function pptoTotalesSeleccion(registros, seleccionados) {
  const set = seleccionados instanceof Set ? seleccionados : new Set(seleccionados || [])
  let cant = 0
  let costo = 0
  let n = 0
  for (const r of registros || []) {
    if (!set.has(r?.id)) continue
    n += 1
    const c = Number(r.cant_total)
    const d = Number(r.costo_directo)
    if (Number.isFinite(c)) cant += c
    if (Number.isFinite(d)) costo += d
  }
  return { n, cant, costo }
}
