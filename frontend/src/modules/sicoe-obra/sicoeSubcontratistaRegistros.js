/**
 * Visibilidad de registros para empresa subcontratista dentro del reporte.
 * Solo líneas de su sub (con fallback a cabecera). No exige objeto de pago.
 */

import { sicoeSubcontratistaIdDeRegistro } from './sicoeRegistroSubcontratista.js'

export function sicoeIdsSubIguales(a, b) {
  if (a == null || b == null) return false
  const sa = String(a).trim()
  const sb = String(b).trim()
  if (!sa || !sb) return false
  return sa === sb
}

export function sicoeEsObjetoPagoSub(reg) {
  const v = reg?.nivel2_objeto_pago_sub
  if (v === true || v === 1) return true
  if (v === false || v === 0 || v == null) return false
  const s = String(v).trim().toLowerCase()
  return s === '1' || s === 'true' || s === 't' || s === 'si' || s === 'sí' || s === 'yes'
}

/** Registro visible para el usuario subcontratista (cualquier validación / objeto de pago). */
export function sicoeRegistroVisibleParaSub(reg, subIdUsuario, reporte = null) {
  if (!reg) return false
  if (subIdUsuario == null || String(subIdUsuario).trim() === '') return false
  const eff = sicoeSubcontratistaIdDeRegistro(reg, reporte)
  return sicoeIdsSubIguales(eff, subIdUsuario)
}

export function sicoeFiltrarRegistrosParaSub(regs, subIdUsuario, reporte = null) {
  return (regs || []).filter((r) => sicoeRegistroVisibleParaSub(r, subIdUsuario, reporte))
}
