/**
 * Permisos Plan de actividades — fila «Plan de actividades» / PLANACT.
 */
import { esDesarrolladorUsuario, tienePermisoFlag } from '../../utils/permisosContrato.js'
import { esContratistaGerencial } from './seguimientoPermisos.js'
import { esRolAdministrativoUsuario } from '../rrhh/rrhhPermisos.js'

export const PLAN_FUNCION = 'plan de actividades'
export const PLAN_FUNCION_ALT = 'planactividades'
export const PLAN_FUNCION_CODIGO = 'planact'

const TODOS = {
  ver: true,
  crear: true,
  editar: true,
  eliminar: true,
  exportar: true,
}

export function permisoPlanActividades(usuario, accion, contratoId) {
  if (esDesarrolladorUsuario(usuario)) return true
  const cid = contratoId ?? usuario?.contrato_id
  if (tienePermisoFlag(usuario, PLAN_FUNCION, accion, cid)) return true
  if (tienePermisoFlag(usuario, PLAN_FUNCION_ALT, accion, cid)) return true
  return tienePermisoFlag(usuario, PLAN_FUNCION_CODIGO, accion, cid)
}

export function accesoPlanActividades(usuario, contratoId) {
  const esDev = esDesarrolladorUsuario(usuario)
  const cid = contratoId ?? usuario?.contrato_id
  if (esDev) {
    return {
      ...TODOS,
      bloqueado: false,
      esDesarrollador: true,
      esVistaAmplia: true,
    }
  }
  return {
    ver: permisoPlanActividades(usuario, 'ver', cid),
    crear: permisoPlanActividades(usuario, 'crear', cid),
    editar: permisoPlanActividades(usuario, 'editar', cid),
    eliminar: permisoPlanActividades(usuario, 'eliminar', cid),
    exportar: permisoPlanActividades(usuario, 'exportar', cid),
    bloqueado: false,
    esDesarrollador: false,
    esVistaAmplia:
      esContratistaGerencial(usuario) || esRolAdministrativoUsuario(usuario),
  }
}

/** Solo el creador (o Dev) puede editar/eliminar, aunque el cargo tenga el flag. */
export function puedeMutarActividadPropia(actividad, usuario, permisos, accion) {
  if (!actividad || !permisos?.[accion]) return false
  if (permisos.esDesarrollador) return true
  const uid = Number(usuario?.id || usuario?.sub || 0)
  const creator = Number(actividad.created_by || 0)
  return uid > 0 && creator === uid
}
