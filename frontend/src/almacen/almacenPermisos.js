/**
 * Permisos del módulo «Almacén» (matriz Control de accesos).
 */
import { esDesarrolladorUsuario, tienePermisoFlag } from '../utils/permisosContrato'

export const ALMACEN_FUNCION = 'almacén'

function normRol(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function esValidadorAlmacenPorCargo(usuario) {
  const cargo = normRol(usuario?.cargo_nombre || usuario?.cargo)
  return cargo === 'director de obra' || cargo === 'administrador'
}

const TODOS_PERMISOS = {
  ver: true,
  crear: true,
  editar: true,
  validar: true,
  exportar: true,
}

/** Interventoría, Interventoría Gerencial, Supervisión Externa — sin acceso al módulo. */
export function rolExcluidoAlmacen(usuario) {
  const rol = normRol(usuario?.rol_nombre || usuario?.rol)
  if (rol === 'interventoria') return true
  if (rol === 'interventoria gerencial') return true
  if (rol === 'supervision externa') return true
  if (rol.includes('intervent') && rol.includes('gerencial')) return true
  if (rol.includes('supervis') && rol.includes('extern')) return true
  return false
}

/** Contratista y gerencial contratista ven valores económicos; operativos no. */
export function puedeVerValoresEconomicosAlmacen(usuario) {
  if (esDesarrolladorUsuario(usuario)) return true
  const rol = normRol(usuario?.rol_nombre || usuario?.rol)
  if (rol === 'contratista' || rol === 'operativo contratista') return true
  if (rol.includes('contrat') && rol.includes('gerencial') && !rol.includes('intervent')) return true
  return false
}

/** Solo Contratista Gerencial (o Desarrollador) mapea insumo y aprueba. */
export function esContratistaGerencialUsuario(usuario) {
  if (esDesarrolladorUsuario(usuario)) return true
  const rol = normRol(usuario?.rol_nombre || usuario?.rol)
  if (rol === 'contratista gerencial') return true
  if (rol.includes('contrat') && rol.includes('gerencial') && !rol.includes('intervent')) return true
  return false
}

/** Revisión Gerencial: permiso validar + rol Contratista Gerencial. */
export function puedeRevisarSolicitudGerencial(usuario, permisos) {
  if (permisos?.esDesarrollador || esDesarrolladorUsuario(usuario)) return Boolean(permisos?.validar ?? true)
  return Boolean(permisos?.validar && (permisos?.esContratistaGerencial || esContratistaGerencialUsuario(usuario)))
}

export function permisoAlmacen(usuario, accion, contratoId) {
  if (rolExcluidoAlmacen(usuario)) return false
  if (esDesarrolladorUsuario(usuario)) return true
  if (accion === 'validar' && esValidadorAlmacenPorCargo(usuario)) return true
  const cid = contratoId ?? usuario?.contrato_id
  if (tienePermisoFlag(usuario, ALMACEN_FUNCION, accion, cid)) return true
  return tienePermisoFlag(usuario, 'almacen', accion, cid)
}

export function permisosAlmacen(usuario, contratoId) {
  if (rolExcluidoAlmacen(usuario)) {
    return { ver: false, crear: false, editar: false, validar: false, exportar: false }
  }
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

export function accesoAlmacen(usuario, contratoId) {
  const bloqueado = rolExcluidoAlmacen(usuario)
  const permisos = permisosAlmacen(usuario, contratoId)
  const esGerencial = !bloqueado && esContratistaGerencialUsuario(usuario)
  return {
    bloqueado,
    permisos: {
      ...permisos,
      esContratistaGerencial: esGerencial,
    },
    verEconomicos: !bloqueado && puedeVerValoresEconomicosAlmacen(usuario),
    esContratistaGerencial: esGerencial,
  }
}

export function puedeAlmacen(permisos, accion) {
  return Boolean(permisos?.[accion])
}

/** Nueva entrada: crear o editar (cualquiera basta). */
export function puedeRegistrarEntradaAlmacen(permisos) {
  return Boolean(permisos?.crear || permisos?.editar)
}

/** Nueva salida: crear o editar (cualquiera basta). */
export function puedeRegistrarSalidaAlmacen(permisos) {
  return Boolean(permisos?.crear || permisos?.editar)
}

/** Nivel 2 / Nivel 3 — alertas silenciosas de control en entradas Despachador. */
export function puedeVerAlertasEntrada(permisos) {
  return Boolean(permisos?.validar || permisos?.editar)
}

/** Solicitud editable hasta generar OC (no aprobada). */
export function solicitudAlmacenEditable(sol) {
  if (!sol) return true
  return sol.estado !== 'aprobada'
}

/** Título editable en cualquier estado si hay permiso editar. */
export function solicitudTituloEditable(permisos) {
  return Boolean(permisos?.editar)
}

/** Eliminación permanente de solicitudes — exclusivo cargo Desarrollador. */
export function puedeEliminarSolicitudDesarrollador(permisos) {
  return Boolean(permisos?.esDesarrollador)
}
