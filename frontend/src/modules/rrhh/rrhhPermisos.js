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

export function esAdministrativoUsuario(usuario) {
  const cargo = String(usuario?.cargo_nombre || usuario?.cargo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  return cargo === 'administrativo'
}

export function esAdministradorUsuario(usuario) {
  const cargo = String(usuario?.cargo_nombre || usuario?.cargo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  return cargo === 'administrador'
}

export function puedeVerSalarioRrhh(usuario) {
  return esDesarrolladorUsuario(usuario) || esAdministrativoUsuario(usuario) || esAdministradorUsuario(usuario)
}

export function permisoRrhh(usuario, accion, contratoId) {
  if (esDesarrolladorUsuario(usuario)) return true
  const cid = contratoId ?? usuario?.contrato_id
  const p = permisoFila(usuario, cid)
  if (p && p[accion]) return true
  return esAdministrativoUsuario(usuario)
}

export function accesoRrhh(usuario, contratoId) {
  const esDev = esDesarrolladorUsuario(usuario)
  const cid = contratoId ?? usuario?.contrato_id
  const verSalario = puedeVerSalarioRrhh(usuario)
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
    esAdministrativo: esAdministrativoUsuario(usuario),
    puedeAdminCatalogo: esAdmin || permisoRrhh(usuario, 'editar', cid),
    verSalario,
  }
}
