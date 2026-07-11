/**
 * Permisos del módulo «Catálogo de insumos» (matriz Control de accesos).
 */
import { esDesarrolladorUsuario, tienePermisoFlag } from '../utils/permisosContrato'

export const CATALOGO_INSUMOS_FUNCIONES = ['catálogo de insumos', 'catalogo de insumos']

const TODOS_PERMISOS = {
  ver: true,
  crear: true,
  editar: true,
  eliminar: true,
  validar: true,
  exportar: true,
}

function matchCatalogoFuncion(nombreFuncion) {
  const want = (nombreFuncion || '').toLowerCase().trim()
  return CATALOGO_INSUMOS_FUNCIONES.some((n) => n === want)
}

export function permisoCatalogoInsumos(usuario, accion, contratoId) {
  if (esDesarrolladorUsuario(usuario)) return true
  const cid = contratoId ?? usuario?.contrato_id
  for (const nombre of CATALOGO_INSUMOS_FUNCIONES) {
    if (tienePermisoFlag(usuario, nombre, accion, cid)) return true
  }
  return (usuario?.permisos || []).some(
    (p) => matchCatalogoFuncion(p.funcion_nombre) && p[accion],
  )
}

export function permisosCatalogoInsumos(usuario, contratoId) {
  if (esDesarrolladorUsuario(usuario)) return { ...TODOS_PERMISOS }
  const cid = contratoId ?? usuario?.contrato_id
  return {
    ver: permisoCatalogoInsumos(usuario, 'ver', cid),
    crear: permisoCatalogoInsumos(usuario, 'crear', cid),
    editar: permisoCatalogoInsumos(usuario, 'editar', cid),
    eliminar: permisoCatalogoInsumos(usuario, 'eliminar', cid),
    validar: permisoCatalogoInsumos(usuario, 'validar', cid),
    exportar: permisoCatalogoInsumos(usuario, 'exportar', cid),
  }
}

export const PERMISOS_ADMIN_TODOS = { ...TODOS_PERMISOS }
