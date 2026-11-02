/**
 * Indicador de filas visibles / ocultas en la tabla OC de Llegó material.
 */

/** @returns {{ visible: number, total: number, hayOcultas: boolean, marcadasOcultas: number }} */
export function medirVistaTablaOc(scrollEl, rowEls, markedKeys = new Set()) {
  const total = Array.isArray(rowEls) ? rowEls.length : 0
  if (!scrollEl || !total) {
    return { visible: total, total, hayOcultas: false, marcadasOcultas: 0 }
  }
  const top = scrollEl.scrollTop
  const bottom = top + scrollEl.clientHeight
  let visible = 0
  let marcadasOcultas = 0
  for (const row of rowEls) {
    if (!row) continue
    const rowTop = row.offsetTop
    const rowBottom = rowTop + row.offsetHeight
    const inView = rowBottom > top + 2 && rowTop < bottom - 2
    if (inView) {
      visible += 1
    } else {
      const key = row.getAttribute?.('data-row-key') || ''
      if (key && markedKeys.has(key)) marcadasOcultas += 1
    }
  }
  const hayOcultas = visible < total
  return { visible, total, hayOcultas, marcadasOcultas }
}

export function textoAlertaVistaTablaOc({ visible, total, hayOcultas, marcadasOcultas } = {}) {
  if (!hayOcultas || !total) return ''
  const base = `${visible} de ${total} insumos en vista · Desplace para ver los ${total}`
  if (marcadasOcultas > 0) {
    return `${base} · ${marcadasOcultas} marcado${marcadasOcultas === 1 ? '' : 's'} fuera de vista`
  }
  return base
}
