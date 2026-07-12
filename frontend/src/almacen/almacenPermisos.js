/**
 * Permisos del módulo «Almacén» (matriz Control de accesos).
 */
import { esDesarrolladorUsuario, tienePermisoFlag } from '../utils/permisosContrato'

export const ALMACEN_FUNCION = 'almacén'

function normCargo(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function esValidadorAlmacenPorCargo(usuario) {
  const cargo = normCargo(usuario?.cargo_nombre || usuario?.cargo)
  return cargo === 'director de obra' || cargo === 'administrador'
}

const TODOS_PERMISOS = {
  ver: true,
  crear: true,
  editar: true,
  validar: true,
  exportar: true,
}

export function permisoAlmacen(usuario, accion, contratoId) {
  if (esDesarrolladorUsuario(usuario)) return true
  if (accion === 'validar' && esValidadorAlmacenPorCargo(usuario)) return true
  const cid = contratoId ?? usuario?.contrato_id
  if (tienePermisoFlag(usuario, ALMACEN_FUNCION, accion, cid)) return true
  return tienePermisoFlag(usuario, 'almacen', accion, cid)
}

export function permisosAlmacen(usuario, contratoId) {
  if (esDesarrolladorUsuario(usuario)) return { ...TODOS_PERMISOS }
  const cid = contratoId ?? usuario?.contrato_id
  return {
    ver: permisoAlmacen(usuario, 'ver', cid),
    crear: permisoAlmacen(usuario, 'crear', cid),
    editar: permisoAlmacen(usuario, 'editar', cid),
    validar: permisoAlmacen(usuario, 'validar', cid),
    exportar: permisoAlmacen(usuario, 'exportar', cid),
  }
}

export function puedeAlmacen(permisos, accion) {
  return Boolean(permisos?.[accion])
}

/** Nivel 2 / Nivel 3 — alertas silenciosas de control en entradas Despachador. */
export function puedeVerAlertasEntrada(permisos) {
  return Boolean(permisos?.validar || permisos?.editar)
}
