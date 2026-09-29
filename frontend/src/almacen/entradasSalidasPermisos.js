/**
 * Permisos de la función «Entradas y Salidas» (matriz Control de accesos).
 * Independiente de Almacén (solicitudes/inventario) y Catálogo de insumos.
 */
import { esDesarrolladorUsuario, tienePermisoAlgunaAccion, permisoFuncionContrato } from '../utils/permisosContrato'

export const ENTRADAS_SALIDAS_FUNCIONES = ['entradas y salidas']

const TODOS_PERMISOS = {
  ver: true,
  crear: true,
  editar: true,
  eliminar: true,
  validar: true,
  exportar: true,
}

const NINGUNO = {
  ver: false,
  crear: false,
  editar: false,
  eliminar: false,
  validar: false,
  exportar: false,
}

function rolExcluido(usuario) {
  const rol = String(usuario?.rol_nombre || usuario?.rol || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
  if (rol === 'interventoria' || rol === 'interventoria gerencial' || rol === 'supervision externa') return true
  if (rol.includes('intervent') && rol.includes('gerencial')) return true
  if (rol.includes('supervis') && rol.includes('extern')) return true
  return false
}

function filaEntradasSalidas(usuario, contratoId) {
  const cid = contratoId ?? usuario?.contrato_id
  for (const nombre of ENTRADAS_SALIDAS_FUNCIONES) {
    const row = permisoFuncionContrato(usuario, nombre, cid)
    if (row) return row
  }
  // Fallback por coincidencia parcial (histórico / tipografía).
  const cidNum = Number(cid)
  const fuzzy = (usuario?.permisos || []).filter((p) => {
    const n = (p.funcion_nombre || '').toLowerCase().trim()
    return n === 'entradas y salidas' || (n.includes('entradas') && n.includes('salidas'))
  })
  if (!fuzzy.length) return null
  if (Number.isFinite(cidNum)) {
    return fuzzy.find((p) => Number(p.contrato_id) === cidNum)
      || fuzzy.find((p) => p.contrato_id == null || p.contrato_id === '')
      || null
  }
  return fuzzy[0]
}

export function permisoEntradasSalidas(usuario, accion, contratoId) {
  if (rolExcluido(usuario)) return false
  if (esDesarrolladorUsuario(usuario)) return true
  const row = filaEntradasSalidas(usuario, contratoId)
  return !!(row && row[accion])
}

export function permisosEntradasSalidas(usuario, contratoId) {
  if (rolExcluido(usuario)) return { ...NINGUNO }
  if (esDesarrolladorUsuario(usuario)) return { ...TODOS_PERMISOS }
  const cid = contratoId ?? usuario?.contrato_id
  return {
    ver: permisoEntradasSalidas(usuario, 'ver', cid),
    crear: permisoEntradasSalidas(usuario, 'crear', cid),
    editar: permisoEntradasSalidas(usuario, 'editar', cid),
    eliminar: permisoEntradasSalidas(usuario, 'eliminar', cid),
    validar: permisoEntradasSalidas(usuario, 'validar', cid),
    exportar: permisoEntradasSalidas(usuario, 'exportar', cid),
  }
}

/** True si el cargo tiene al menos un flag en Entradas y Salidas. */
export function tieneAlgunaAccionEntradasSalidas(usuario, contratoId) {
  if (rolExcluido(usuario)) return false
  if (esDesarrolladorUsuario(usuario)) return true
  return tienePermisoAlgunaAccion(filaEntradasSalidas(usuario, contratoId))
}
