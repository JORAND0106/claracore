/**
 * Permisos Recursos Humanos — fila «Recursos Humanos» (legado «RRHH») en Control de accesos.
 */
import { esDesarrolladorUsuario, permisoFuncionContrato } from '../../utils/permisosContrato.js'

export const RRHH_FUNCION = 'recursos humanos'
export const RRHH_FUNCION_LEGACY = 'rrhh'

const TODOS = {
  ver: true,
  crear: true,
  editar: true,
  eliminar: true,
  validar: true,
  exportar: true,
}

function permisoFila(usuario, contratoId) {
  return (
    permisoFuncionContrato(usuario, RRHH_FUNCION, contratoId)
    || permisoFuncionContrato(usuario, 'Recursos Humanos', contratoId)
    || permisoFuncionContrato(usuario, RRHH_FUNCION_LEGACY, contratoId)
    || permisoFuncionContrato(usuario, 'RRHH', contratoId)
  )
}

export function permisoRrhh(usuario, accion, contratoId) {
  if (esDesarrolladorUsuario(usuario)) return true
  const cid = contratoId ?? usuario?.contrato_id
  const p = permisoFila(usuario, cid)
  return !!(p && p[accion])
}

export function accesoRrhh(usuario, contratoId) {
  const esDev = esDesarrolladorUsuario(usuario)
  const cid = contratoId ?? usuario?.contrato_id
  if (esDev) {
    return { ...TODOS, bloqueado: false, esDesarrollador: true, puedeAdminCatalogo: true }
  }
  const cargo = String(usuario?.cargo_nombre || usuario?.cargo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  const esAdmin = cargo === 'administrador'
  return {
    ver: permisoRrhh(usuario, 'ver', cid),
    crear: permisoRrhh(usuario, 'crear', cid),
    editar: permisoRrhh(usuario, 'editar', cid),
    eliminar: permisoRrhh(usuario, 'eliminar', cid),
    validar: permisoRrhh(usuario, 'validar', cid),
    exportar: permisoRrhh(usuario, 'exportar', cid),
    bloqueado: false,
    esDesarrollador: false,
    puedeAdminCatalogo: esAdmin || permisoRrhh(usuario, 'editar', cid),
  }
}
