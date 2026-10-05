/**
 * Identifica la fila de la función Almacén en la matriz de sesión.
 * Acepta tilde, tilde descompuesta, «Almacén de Obra» y código ALMACEN.
 */

export function normNombreFuncion(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export function esFuncionAlmacen(row) {
  const nombre = normNombreFuncion(row?.funcion_nombre)
  const codigo = String(row?.funcion_codigo || row?.codigo || '').trim().toUpperCase()
  if (codigo === 'ALMACEN') return true
  return nombre === 'almacen' || nombre === 'almacen de obra'
}

/** Fila del contrato activo, o la legacy (contrato_id vacío) si no hay una propia. */
export function elegirFilaFuncion(rows, contratoId) {
  const list = rows || []
  if (!list.length) return null
  const cid = Number(contratoId)
  if (Number.isFinite(cid)) {
    const exact = list.find((p) => Number(p.contrato_id) === cid)
    if (exact) return exact
    const legacy = list.find((p) => p.contrato_id == null || p.contrato_id === '')
    if (legacy) return legacy
    return null
  }
  return list[0]
}

export function filaAlmacenEnSesion(usuario, contratoId) {
  const cid = contratoId ?? usuario?.contrato_id
  const rows = (usuario?.permisos || []).filter(esFuncionAlmacen)
  return elegirFilaFuncion(rows, cid)
}
