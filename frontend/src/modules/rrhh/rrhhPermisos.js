/**
 * Permisos Recursos Humanos — fila «Recursos Humanos» (legado «RRHH») en Control de accesos.
 *
 * El ROL «Administrativo» (tabla roles) ve salarios, nómina y liquidación, y tiene
 * acceso amplio a módulos (inyectado en login/me). No confundir con un cargo.
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

function _norm(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function permisoFila(usuario, contratoId) {
  return (
    permisoFuncionContrato(usuario, RRHH_FUNCION, contratoId)
    || permisoFuncionContrato(usuario, 'Recursos Humanos', contratoId)
    || permisoFuncionContrato(usuario, RRHH_FUNCION_LEGACY, contratoId)
    || permisoFuncionContrato(usuario, 'RRHH', contratoId)
  )
}

/** ROL Administrativo (tabla `roles`), no cargo. */
export function esRolAdministrativoUsuario(usuario) {
  const rol = _norm(usuario?.rol_nombre || usuario?.rol)
  return rol === 'administrativo'
}

/** @deprecated Usar esRolAdministrativoUsuario — alias de compatibilidad. */
export function esAdministrativoUsuario(usuario) {
  return esRolAdministrativoUsuario(usuario)
}

export function esAdministradorUsuario(usuario) {
  return _norm(usuario?.cargo_nombre || usuario?.cargo) === 'administrador'
}

export function puedeVerSalarioRrhh(usuario) {
  return (
    esDesarrolladorUsuario(usuario)
    || esRolAdministrativoUsuario(usuario)
    || esAdministradorUsuario(usuario)
  )
}

export function permisoRrhh(usuario, accion, contratoId) {
  if (esDesarrolladorUsuario(usuario)) return true
  if (esRolAdministrativoUsuario(usuario)) return true
  const cid = contratoId ?? usuario?.contrato_id
  const p = permisoFila(usuario, cid)
  return !!(p && p[accion])
}

export function accesoRrhh(usuario, contratoId) {
  const esDev = esDesarrolladorUsuario(usuario)
  const cid = contratoId ?? usuario?.contrato_id
  const verSalario = puedeVerSalarioRrhh(usuario)
  const esAdminRol = esRolAdministrativoUsuario(usuario)
  if (esDev) {
    return {
      ...TODOS,
      bloqueado: false,
      esDesarrollador: true,
      esAdministrativo: false,
      puedeAdminCatalogo: true,
      verSalario: true,
    }
  }
  const esAdminCargo = esAdministradorUsuario(usuario)
  return {
    ver: permisoRrhh(usuario, 'ver', cid),
    crear: permisoRrhh(usuario, 'crear', cid),
    editar: permisoRrhh(usuario, 'editar', cid),
    eliminar: permisoRrhh(usuario, 'eliminar', cid),
    validar: permisoRrhh(usuario, 'validar', cid),
    exportar: permisoRrhh(usuario, 'exportar', cid),
    bloqueado: false,
    esDesarrollador: false,
    esAdministrativo: esAdminRol,
    puedeAdminCatalogo: esAdminCargo || permisoRrhh(usuario, 'editar', cid),
    verSalario,
  }
}
