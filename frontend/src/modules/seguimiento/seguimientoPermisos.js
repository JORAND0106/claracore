import { esDesarrolladorUsuario } from '../../utils/permisosContrato.js'

/**
 * Acceso al módulo Seguimiento.
 * Abierto para todos los roles de plataforma (ver/crear/editar/validar/exportar).
 * Solo «eliminar» (borrado definitivo de actas/tareas) queda exclusivo de Desarrollador.
 * No depende de la matriz Control de accesos (a diferencia de Almacén, etc.).
 */
export function accesoSeguimiento(usuario, _contratoId) {
  const esDev = esDesarrolladorUsuario(usuario)
  return {
    ver: true,
    crear: true,
    editar: true,
    eliminar: esDev,
    validar: true,
    exportar: true,
    bloqueado: false,
    esDesarrollador: esDev,
    esGerencial: esContratistaGerencial(usuario),
  }
}

export function esContratistaGerencial(usuario) {
  const rol = String(usuario?.rol_nombre || usuario?.rol || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (rol.includes('contratista gerencial')) return true
  return Number(usuario?.rol_id) === 7
}
