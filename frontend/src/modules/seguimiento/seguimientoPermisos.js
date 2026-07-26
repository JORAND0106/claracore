import { esDesarrolladorUsuario, permisoFuncionContrato } from '../../utils/permisosContrato'

const FUNC = 'Seguimiento'

export function accesoSeguimiento(usuario, contratoId) {
  if (esDesarrolladorUsuario(usuario)) {
    return {
      ver: true,
      crear: true,
      editar: true,
      eliminar: true,
      validar: true,
      exportar: true,
      bloqueado: false,
      esGerencial: esContratistaGerencial(usuario),
    }
  }
  const p = permisoFuncionContrato(usuario, FUNC, contratoId)
  return {
    ver: !!p?.ver,
    crear: !!p?.crear,
    editar: !!p?.editar,
    eliminar: !!p?.eliminar,
    validar: !!p?.validar,
    exportar: !!p?.exportar,
    bloqueado: !p?.ver,
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
