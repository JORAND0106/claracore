/**
 * Grilla Excel de líneas de OC en Llegó material (teclado + marcar por cantidad).
 */

export function splitInsumoCodigoDesc(materialDescripcion) {
  const raw = String(materialDescripcion || '').trim()
  if (!raw) return { codigo: '', descripcion: '—' }
  const m = raw.match(/^([A-Za-z0-9._/-]+)\s*[—–-]\s*(.+)$/)
  if (m) return { codigo: m[1].trim(), descripcion: m[2].trim() }
  return { codigo: '', descripcion: raw }
}

export function parseCantidadCelda(raw) {
  const s = String(raw ?? '').trim().replace(',', '.')
  if (!s) return { empty: true, value: 0 }
  const n = Number(s)
  if (!Number.isFinite(n)) return { empty: true, value: 0 }
  return { empty: n === 0, value: n }
}

/** Al editar cantidad: marca si > 0, desmarca si vacío/cero. */
export function applyCantidadToOcRow(row, rawCantidad) {
  const parsed = parseCantidadCelda(rawCantidad)
  const cantidad = parsed.empty ? '' : String(rawCantidad).replace(/[^0-9.,]/g, '').replace(',', '.')
  return {
    ...row,
    cantidad,
    marked: !parsed.empty && parsed.value > 0,
  }
}

export function formatCantidadDisplay2(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  return v.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/**
 * Navegación teclado en celdas de cantidad.
 * @returns {{ action: 'stay'|'next'|'prev'|'up'|'down'|'continue', select?: boolean }}
 */
export function excelCantidadKeyNav(key, { shiftKey = false, isLast = false, isFirst = false } = {}) {
  if (key === 'Enter') {
    if (isLast) return { action: 'continue', select: false }
    return { action: 'next', select: true }
  }
  if (key === 'Tab') {
    if (shiftKey) {
      if (isFirst) return { action: 'stay', select: true }
      return { action: 'prev', select: true }
    }
    if (isLast) return { action: 'continue', select: false }
    return { action: 'next', select: true }
  }
  if (key === 'ArrowDown') {
    if (isLast) return { action: 'stay', select: true }
    return { action: 'down', select: true }
  }
  if (key === 'ArrowUp') {
    if (isFirst) return { action: 'stay', select: true }
    return { action: 'up', select: true }
  }
  return { action: 'stay', select: false }
}
