/**
 * Roles y capa depuración → interventoría (presupuesto).
 * Alineado con backend: presupuesto_helpers._es_rol_interventoria_ppto,
 * main._pre_interv_liberado, bulk-estado.
 * Listados: Interventoría ve las mismas filas que Contratista; la depuración
 * solo bloquea validación Interventoría, no visibilidad.
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

/** Cargo Desarrollador exacto (alineado con backend `_es_desarrollador`). */
export function esCargoDesarrolladorPresupuesto(usuario) {
  const cargo = normRolPresupuesto(usuario?.cargo_nombre || usuario?.cargo || '')
  return cargo === 'desarrollador'
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

/** Siempre false: el backend ya no oculta filas por rol Interventoría. */
export function usuarioAplicaFiltroInterventoriaEnListado() {
  return false
}
