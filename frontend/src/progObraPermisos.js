/**
 * Permisos del módulo «Programación de obra» (matriz Control de accesos).
 * Misma convención que permisosContrato / Topografía.
 */
import { tienePermisoFlag } from './utils/permisosContrato'

export const PROG_OBRA_FUNCION = 'programación de obra'

export function permisoProgramacionObra(usuario, accion, contratoId) {
  return tienePermisoFlag(usuario, PROG_OBRA_FUNCION, accion, contratoId)
}

/** Paquete de flags usado por App.jsx y ModuloProgramacionObra. */
export function permisosProgramacionObra(usuario, contratoId) {
  const cid = contratoId ?? usuario?.contrato_id
  const ver = permisoProgramacionObra(usuario, 'ver', cid)
  const crear = permisoProgramacionObra(usuario, 'crear', cid)
  const editar = permisoProgramacionObra(usuario, 'editar', cid)
  const validar = permisoProgramacionObra(usuario, 'validar', cid)
  const exportar = permisoProgramacionObra(usuario, 'exportar', cid)
  return {
    ver,
    crear,
    editar,
    validar,
    exportar,
    /** Modificar fechas, dependencias y CPM: editar o crear. */
    escribir: editar || crear,
  }
}

export function puedeProg(permisos, accion) {
  return Boolean(permisos?.[accion])
}
