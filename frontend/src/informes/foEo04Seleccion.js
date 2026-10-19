/** Identidad de un formato FO-EO-04: capítulo e ítem tal como se imprimen. */
export function claveFoEo04(fila) {
  const cap = String(fila?.capitulo ?? '').trim()
  const num = String(fila?.item_numero ?? '').trim()
  return `${cap}||${num}`
}

/** Misma cantidad que «TOTAL EJECUTADO PRESENTE ACTA»: 3 decimales, es-CO. */
export function fmtCantidadFoEo04(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(x)
}

export function firmaSeleccionFoEo04(filas, claves) {
  if (!claves) return 'todos'
  return claves.map(claveFoEo04).join('\n')
}
