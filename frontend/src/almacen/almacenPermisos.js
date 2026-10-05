/**
 * Permisos del módulo «Almacén» (matriz Control de accesos).
 *
 * Tres funciones independientes:
 * - Almacén (general): Solicitudes e Inventario
 * - Entradas y Salidas: Entradas, Salidas, Despacho, Devoluciones
 * - Catálogo de insumos: catálogo / proveedores / cotizaciones
 */
import { esDesarrolladorUsuario, tienePermisoAlgunaAccion } from '../utils/permisosContrato'
import { filaAlmacenEnSesion } from './almacenFuncionMatch.js'
import { permisosCatalogoInsumos, tieneAlgunaAccionCatalogoInsumos } from '../admin/catalogoInsumosPermisos'
import { permisosEntradasSalidas, tieneAlgunaAccionEntradasSalidas } from './entradasSalidasPermisos'

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
  // Solo Director de obra retiene validación por cargo (regla operativa).
  // Cargo Administrador ya no bypassea: debe tener validar en la matriz.
  const cargo = normRol(usuario?.cargo_nombre || usuario?.cargo)
  return cargo === 'director de obra'
}

const TODOS_PERMISOS = {
  ver: true,
  crear: true,
  editar: true,
  eliminar: true,
  validar: true,
  exportar: true,
}

const NINGUNO = {
  ver: false,
  crear: false,
  editar: false,
  eliminar: false,
  validar: false,
  exportar: false,
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

/** Rol Operativo Gerencial (no interventoría). */
export function esOperativoGerencialUsuario(usuario) {
  const rol = normRol(usuario?.rol_nombre || usuario?.rol)
  if (rol === 'operativo gerencial') return true
  if (rol.includes('operativo') && rol.includes('gerencial') && !rol.includes('intervent')) return true
  return false
}

/** Cargo Residente Administrativo — excepción para ver valores económicos. */
export function esResidenteAdministrativoUsuario(usuario) {
  const cargo = normRol(usuario?.cargo_nombre || usuario?.cargo)
  return cargo === 'residente administrativo'
}

/**
 * Costos/cobros/utilidad/rentabilidad: solo Operativo Gerencial (rol)
 * o cargo Residente Administrativo (excepción).
 * Desarrollador (plataforma) conserva acceso vía esDesarrolladorUsuario en App.
 */
export function puedeVerValoresEconomicosAlmacen(usuario) {
  if (esDesarrolladorUsuario(usuario)) return true
  if (esOperativoGerencialUsuario(usuario)) return true
  if (esResidenteAdministrativoUsuario(usuario)) return true
  return false
}

/** Contratista Gerencial (o Desarrollador): aprueba y puede corregir insumo post-OC. */
export function esContratistaGerencialUsuario(usuario) {
  if (esDesarrolladorUsuario(usuario)) return true
  const rol = normRol(usuario?.rol_nombre || usuario?.rol)
  if (rol === 'contratista gerencial') return true
  if (rol.includes('contrat') && rol.includes('gerencial') && !rol.includes('intervent')) return true
  return false
}

/** Revisión Gerencial: permiso validar (Almacén) + rol Contratista Gerencial. */
export function puedeRevisarSolicitudGerencial(usuario, permisos) {
  if (permisos?.esDesarrollador || esDesarrolladorUsuario(usuario)) return Boolean(permisos?.validar ?? true)
  return Boolean(permisos?.validar && (permisos?.esContratistaGerencial || esContratistaGerencialUsuario(usuario)))
}

export function permisoAlmacen(usuario, accion, contratoId) {
  if (rolExcluidoAlmacen(usuario)) return false
  if (esDesarrolladorUsuario(usuario)) return true
  if (accion === 'validar' && esValidadorAlmacenPorCargo(usuario)) return true
  const fila = filaAlmacen(usuario, contratoId)
  return Boolean(fila && fila[accion])
}

/** Permisos propios de la función Almacén (solicitudes / inventario). Sin herencia. */
export function permisosAlmacen(usuario, contratoId) {
  if (rolExcluidoAlmacen(usuario)) {
    return { ...NINGUNO }
  }
  if (esDesarrolladorUsuario(usuario)) return { ...TODOS_PERMISOS }
  const cid = contratoId ?? usuario?.contrato_id
  return {
    ver: permisoAlmacen(usuario, 'ver', cid),
    crear: permisoAlmacen(usuario, 'crear', cid),
    editar: permisoAlmacen(usuario, 'editar', cid),
    eliminar: permisoAlmacen(usuario, 'eliminar', cid),
    validar: permisoAlmacen(usuario, 'validar', cid),
    exportar: permisoAlmacen(usuario, 'exportar', cid),
  }
}

function filaAlmacen(usuario, contratoId) {
  return filaAlmacenEnSesion(usuario, contratoId)
}

/** True si hay al menos un flag propio en la función Almacén. */
export function tieneAlgunaAccionAlmacen(usuario, contratoId) {
  if (rolExcluidoAlmacen(usuario)) return false
  if (esDesarrolladorUsuario(usuario)) return true
  if (esValidadorAlmacenPorCargo(usuario)) return true
  return tienePermisoAlgunaAccion(filaAlmacen(usuario, contratoId))
}

/**
 * Llave de entrada al módulo (menú / UI):
 * Almacén (cualquier flag) OR Catálogo OR Entradas y Salidas.
 * No otorga por sí sola tabs de Solicitudes/Inventario.
 */
export function tieneAccesoUiModuloAlmacen(usuario, contratoId) {
  if (rolExcluidoAlmacen(usuario)) return false
  if (esDesarrolladorUsuario(usuario)) return true
  const cid = contratoId ?? usuario?.contrato_id
  if (tieneAlgunaAccionAlmacen(usuario, cid)) return true
  if (tieneAlgunaAccionCatalogoInsumos(usuario, cid)) return true
  if (tieneAlgunaAccionEntradasSalidas(usuario, cid)) return true
  return false
}

export function accesoAlmacen(usuario, contratoId) {
  const bloqueado = rolExcluidoAlmacen(usuario)
  const cid = contratoId ?? usuario?.contrato_id
  const permisos = permisosAlmacen(usuario, cid)
  const catalogo = bloqueado
    ? { ...NINGUNO }
    : permisosCatalogoInsumos(usuario, cid)
  const entradasSalidas = bloqueado
    ? { ...NINGUNO }
    : permisosEntradasSalidas(usuario, cid)
  const esGerencial = !bloqueado && esContratistaGerencialUsuario(usuario)
  const puedeEntrar = !bloqueado && tieneAccesoUiModuloAlmacen(usuario, cid)
  const algunaAlmacen = !bloqueado && tieneAlgunaAccionAlmacen(usuario, cid)
  return {
    bloqueado,
    /** Entrada al módulo (Ver sintético si solo tiene CATINS o ENTSAL). */
    puedeEntrar,
    /** Tabs Solicitudes / Inventario: requiere permiso propio en Almacén. */
    verSolicitudesInventario: algunaAlmacen,
    /** Botón / vista Catálogo: permiso propio en CATINS. */
    verCatalogo: !bloqueado && tieneAlgunaAccionCatalogoInsumos(usuario, cid),
    /** Tabs Entradas / Salidas: permiso propio en ENTSAL. */
    verEntradasSalidas: !bloqueado && tieneAlgunaAccionEntradasSalidas(usuario, cid),
    permisos: {
      ...permisos,
      esContratistaGerencial: esGerencial,
    },
    catalogo,
    entradasSalidas,
    verEconomicos: !bloqueado && puedeVerValoresEconomicosAlmacen(usuario),
    esContratistaGerencial: esGerencial,
  }
}

export function puedeAlmacen(permisos, accion) {
  return Boolean(permisos?.[accion])
}

/** Nueva entrada: crear o editar en Entradas y Salidas. */
export function puedeRegistrarEntradaAlmacen(permisos) {
  return Boolean(permisos?.crear || permisos?.editar)
}

/** Nueva salida: crear o editar en Entradas y Salidas. */
export function puedeRegistrarSalidaAlmacen(permisos) {
  return Boolean(permisos?.crear || permisos?.editar)
}

/**
 * Editar cantidad de una salida ya registrada.
 * Solo Contratista Gerencial o Desarrollador (no aparece para ningún otro rol).
 */
export function puedeEditarCantidadSalidaAlmacen(permisos) {
  return Boolean(permisos?.esContratistaGerencial || permisos?.esDesarrollador)
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

/** Título editable en cualquier estado si hay permiso editar (Almacén). */
export function solicitudTituloEditable(permisos) {
  return Boolean(permisos?.editar)
}

/** Eliminación permanente de solicitudes — exclusivo cargo Desarrollador. */
export function puedeEliminarSolicitudDesarrollador(permisos) {
  return Boolean(permisos?.esDesarrollador)
}

/**
 * Crear nueva solicitud: requiere Ver y Crear en Almacén (general).
 */
export function puedeCrearSolicitudAlmacen(permisos) {
  return Boolean(permisos?.ver && permisos?.crear)
}

/**
 * Enviar / reenviar solicitud a aprobación: basta Crear o Editar en Almacén.
 * No exige Editar — un usuario con Crear (aunque Ver venga en otro flag) puede sacar el borrador.
 *
 * Si ya hay id pero el estado aún no llegó del GET, se asume borrador editable
 * (evita ocultar el botón un frame tras «Guardar borrador»).
 */
export function puedeEnviarSolicitudAlmacen(permisos, sol = null, { modoReabrirOc = false, solicitudId = null } = {}) {
  if (modoReabrirOc) return false
  if (!permisos?.crear && !permisos?.editar) return false
  const id = solicitudId ?? sol?.id ?? null
  if (!id) return true
  const estado = sol?.estado
  if (estado == null || estado === '') return true
  return estado === 'borrador' || estado === 'rechazada'
}

/** Guardar borrador / editar líneas: Crear o Editar. */
export function puedeEditarSolicitudFormAlmacen(permisos) {
  return Boolean(permisos?.crear || permisos?.editar)
}
