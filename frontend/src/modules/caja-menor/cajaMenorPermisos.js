import { esDesarrolladorUsuario, permisoFuncionContrato } from '../../utils/permisosContrato.js'

const TODOS = {
  ver: true,
  crear: true,
  editar: true,
  eliminar: true,
  validar: true,
  exportar: true,
}

function norm(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function esCargoAdministrador(usuario) {
  const cargo = norm(usuario?.cargo_nombre || usuario?.cargo || '')
  return cargo === 'administrador'
}

/** Misma puerta que el menú: cargo, rol, rol_id 1 o bandera de acceso total. */
export function esDesarrolladorCajaMenor(usuario) {
  if (esDesarrolladorUsuario(usuario)) return true
  if (!usuario) return false
  try {
    if (Number(usuario.rol_id) === 1) return true
  } catch { /* el id no es numérico */ }
  return usuario.es_desarrollador === true || usuario.acceso_total === true
}

export function accesoCajaMenor(usuario, contratoId) {
  if (esDesarrolladorCajaMenor(usuario)) return { ...TODOS, puedeEntrar: true, accesoTotal: true }
  const p = permisoFuncionContrato(usuario, 'caja menor', contratoId)
    || permisoFuncionContrato(usuario, 'Caja Menor', contratoId)
  const flags = {
    ver: !!p?.ver || esCargoAdministrador(usuario),
    crear: !!p?.crear,
    editar: !!p?.editar,
    eliminar: !!p?.eliminar,
    validar: !!p?.validar || esCargoAdministrador(usuario),
    exportar: !!p?.exportar || esCargoAdministrador(usuario),
  }
  return { ...flags, puedeEntrar: flags.ver }
}
