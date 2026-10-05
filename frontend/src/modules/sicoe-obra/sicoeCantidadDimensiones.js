/**
 * Formato de cantidad con dimensiones (A × B × C [= × D] = total) o varilla.
 */
import { formatearCantidadTotal, formatearDimension } from './sicoeCantidadRedondeo.js'
import { sicoeEsVarillaRegistro, sicoeFmtDiametroDisplay } from './sicoeVarilla.js'

function empty(v) {
  return v === '' || v === null || v === undefined
}

function fmtPart(v) {
  if (empty(v)) return null
  const s = formatearDimension(v, { locale: true, empty: null })
  return s == null || s === '' ? null : s
}

function fmtTotal(v) {
  if (empty(v) && v !== 0) return '—'
  return formatearCantidadTotal(v, { locale: true, empty: '—' })
}

/**
 * Texto compacto para celda de cantidad en comparativa.
 * Estándar: A × B × C = total  |  A × B × C × D = total (si hay cantidad)
 * Varilla: L × Ø × kg/m × C = total (campos propios)
 */
export function fmtCantidadConDimensiones(reg) {
  if (!reg) return '—'
  const total = fmtTotal(reg.cantidad_total)

  if (sicoeEsVarillaRegistro(reg)) {
    const parts = []
    const L = fmtPart(reg.longitud)
    if (L) parts.push(L)
    const diam = sicoeFmtDiametroDisplay(reg.diametro_varilla, { empty: '' })
    if (diam) parts.push(diam)
    const peso = fmtPart(reg.peso_kg_m)
    if (peso) parts.push(`${peso} kg/m`)
    const cant = fmtPart(reg.cantidad)
    if (cant) parts.push(cant)
    if (!parts.length) return total
    return `${parts.join(' × ')} = ${total}`
  }

  const A = fmtPart(reg.longitud)
  const B = fmtPart(reg.ancho)
  const C = fmtPart(reg.espesor)
  const D = fmtPart(reg.cantidad)
  const dims = [A, B, C].filter(Boolean)
  if (D) dims.push(D)
  if (!dims.length) return total
  return `${dims.join(' × ')} = ${total}`
}
