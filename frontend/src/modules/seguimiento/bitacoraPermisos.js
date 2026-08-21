/**
 * Permisos Bitácora de Obra — fila «Bitácora» en Control de accesos.
 */
import { esDesarrolladorUsuario, tienePermisoFlag } from '../../utils/permisosContrato.js'

export const BITACORA_FUNCION = 'bitácora'
export const BITACORA_FUNCION_ALT = 'bitacora'

const TODOS = {
  ver: true,
  crear: true,
  editar: true,
  eliminar: true,
  validar: true,
  exportar: true,
}

export function permisoBitacora(usuario, accion, contratoId) {
  if (esDesarrolladorUsuario(usuario)) return true
  const cid = contratoId ?? usuario?.contrato_id
  if (tienePermisoFlag(usuario, BITACORA_FUNCION, accion, cid)) return true
  return tienePermisoFlag(usuario, BITACORA_FUNCION_ALT, accion, cid)
}

export function accesoBitacora(usuario, contratoId) {
  const esDev = esDesarrolladorUsuario(usuario)
  const cid = contratoId ?? usuario?.contrato_id
  if (esDev) {
    return { ...TODOS, bloqueado: false, esDesarrollador: true }
  }
  return {
    ver: permisoBitacora(usuario, 'ver', cid),
    crear: permisoBitacora(usuario, 'crear', cid),
    editar: permisoBitacora(usuario, 'editar', cid),
    eliminar: permisoBitacora(usuario, 'eliminar', cid),
    validar: permisoBitacora(usuario, 'validar', cid),
    exportar: permisoBitacora(usuario, 'exportar', cid),
    bloqueado: false,
    esDesarrollador: false,
  }
}

/** Diario abierto → editar; cerrado/evento → solo Dev. */
export function puedeEditarEntradaBitacora(entrada, permisos) {
  if (!entrada) return false
  if (permisos?.esDesarrollador) return Boolean(permisos?.editar)
  if (!permisos?.editar) return false
  const tipo = String(entrada.tipo || '')
  if (tipo === 'evento') return false
  if (String(entrada.estado || '') === 'cerrado') return false
  if (entrada.puede_autocerrar) return false
  return true
}
