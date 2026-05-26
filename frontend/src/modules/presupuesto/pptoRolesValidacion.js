/**
 * Roles y capa depuración → interventoría (presupuesto).
 * Alineado con backend: presupuesto_helpers._presupuesto_aplica_filtro_interventoria,
 * main._pre_interv_liberado, bulk-estado.
 */

export function normRolPresupuesto(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export function esDesarrolladorPresupuesto(usuario) {
  const cargo = normRolPresupuesto(usuario?.cargo_nombre || usuario?.cargo || '')
  const rol = normRolPresupuesto(usuario?.rol_nombre || usuario?.rol || '')
  return cargo.includes('desarrollador') || rol === 'desarrollador'
}

/** Contratista Gerencial (rol gerencial contratista, sin Interventoría). */
export function esContratistaGerencialPresupuesto(usuario) {
  const rol = normRolPresupuesto(usuario?.rol_nombre || usuario?.rol || '')
  return rol.includes('contrat') && rol.includes('gerencial') && !rol.includes('intervent')
}

/** Contratista o Contratista Gerencial (no perfiles Interventoría). */
export function esRolContratistaDepuracion(usuario) {
  const rol = normRolPresupuesto(usuario?.rol_nombre || usuario?.rol || '')
  if (rol.includes('intervent')) return false
  if (rol === 'contratista' || rol === 'operativo contratista') return true
  return esContratistaGerencialPresupuesto(usuario)
}

/** Interventoría o Interventoría Gerencial. */
export function esRolInterventoriaValidacion(usuario) {
  const rol = normRolPresupuesto(usuario?.rol_nombre || usuario?.rol || '')
  if (rol === 'interventoria' || rol === 'interventoria') return true
  if (rol === 'operativo interventoria') return true
  if (rol.includes('intervent') && rol.includes('gerencial')) return true
  return false
}

/** NULL/vacío = legado; solo «Aprobado» en depuración habilita validación Interventoría. */
export function preIntervLiberadoParaInterventoria(row) {
  const v = row?.pre_interv_estado
  if (v == null) return true
  const s = String(v).trim()
  if (!s) return true
  return s === 'Aprobado'
}

export function usuarioAplicaFiltroInterventoriaEnListado(usuario) {
  if (esDesarrolladorPresupuesto(usuario)) return false
  const rol = normRolPresupuesto(usuario?.rol_nombre || usuario?.rol || '')
  return (
    rol === 'interventoria'
    || rol === 'interventoria'
    || rol === 'operativo interventoria'
  )
}
