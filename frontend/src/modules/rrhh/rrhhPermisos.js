/**
 * Permisos RRHH — fila «RRHH» en Control de accesos.
 */
import { esDesarrolladorUsuario, tienePermisoFlag } from '../../utils/permisosContrato.js'

export const RRHH_FUNCION = 'rrhh'

const TODOS = {
  ver: true,
  crear: true,
  editar: true,
  eliminar: true,
  validar: true,
  exportar: true,
}

export function permisoRrhh(usuario, accion, contratoId) {
  if (esDesarrolladorUsuario(usuario)) return true
  const cid = contratoId ?? usuario?.contrato_id
  return tienePermisoFlag(usuario, RRHH_FUNCION, accion, cid)
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
