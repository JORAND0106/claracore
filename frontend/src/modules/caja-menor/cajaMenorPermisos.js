import { esDesarrolladorUsuario, permisoFuncionContrato } from '../../utils/permisosContrato.js'

const TODOS = {
  ver: true,
  crear: true,
  editar: true,
  eliminar: true,
  validar: true,
  exportar: true,
}

function esRolAdministrador(usuario) {
  const rol = String(usuario?.rol_nombre || usuario?.rol || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
  return rol === 'administrador'
}

export function accesoCajaMenor(usuario, contratoId) {
  if (esDesarrolladorUsuario(usuario)) return { ...TODOS, puedeEntrar: true }
  const p = permisoFuncionContrato(usuario, 'caja menor', contratoId)
    || permisoFuncionContrato(usuario, 'Caja Menor', contratoId)
  const flags = {
    ver: !!p?.ver || esRolAdministrador(usuario),
    crear: !!p?.crear,
    editar: !!p?.editar,
    eliminar: !!p?.eliminar,
    validar: !!p?.validar,
    exportar: !!p?.exportar,
  }
  return { ...flags, puedeEntrar: flags.ver }
}
