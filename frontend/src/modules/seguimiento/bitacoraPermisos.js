/**
 * Permisos Bitácora de Obra — fila «Bitácora» en Control de accesos.
 */
import { esDesarrolladorUsuario, tienePermisoFlag } from '../../utils/permisosContrato.js'
import { hoyISOBogota } from './bitacoraConstants.js'

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

/** Día calendario Bogotá de created_at (o cerrado_en). */
export function fechaCreacionBogotaISO(entrada) {
  const raw = entrada?.created_at || entrada?.cerrado_en
  if (!raw) return null
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(raw))
  } catch {
    return null
  }
}

/**
 * Diario abierto → editar; Evento → editable el día de creación (Bogotá);
 * cerrado / evento de otro día → solo Desarrollador.
 */
export function puedeEditarEntradaBitacora(entrada, permisos) {
  if (!entrada) return false
  if (permisos?.esDesarrollador) return Boolean(permisos?.editar)
  if (!permisos?.editar) return false
  const tipo = String(entrada.tipo || '')
  if (tipo === 'evento') {
    if (entrada.evento_editable_hoy === true) return true
    if (entrada.evento_editable_hoy === false) return false
    const creacion = fechaCreacionBogotaISO(entrada)
    return creacion != null && creacion === hoyISOBogota()
  }
  if (String(entrada.estado || '') === 'cerrado') return false
  if (entrada.puede_autocerrar) return false
  return true
}
