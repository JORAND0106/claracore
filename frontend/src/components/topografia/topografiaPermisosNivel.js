/**
 * Nivel de validación topográfica — espejo de backend `lado_validacion_topo_usuario`.
 * Sin dependencias React (testeable con node --test).
 */

function _norm(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/** Alineado con backend `_es_desarrollador` (cargo Desarrollador). */
export function esDesarrolladorTopo(usuario) {
  const cargo = _norm(usuario?.cargo_nombre || usuario?.cargo || '')
  const rol = _norm(usuario?.rol_nombre || usuario?.rol || '')
  return cargo === 'desarrollador' || rol === 'desarrollador'
}

export function puede(permisos, accion) {
  return Boolean(permisos?.[accion])
}

/**
 * 0=dev (ambos), 1=contratista, 2=interventoría.
 * Sin lado claro → niveles vacíos (no inventar N1; evita 403 al validar).
 */
export function determinarNivelValidacionTopo(usuario, permisos) {
  const rol = _norm(usuario?.rol_nombre || usuario?.rol || '')
  const cargo = _norm(usuario?.cargo_nombre || usuario?.cargo || '')
  const esDev = esDesarrolladorTopo(usuario)
  const puedeValidar = esDev || puede(permisos, 'validar')

  if (!puedeValidar) {
    return { puedeValidar: false, lado: null, esDev, niveles: [] }
  }
  if (esDev) {
    return { puedeValidar: true, lado: 0, esDev: true, niveles: [1, 2] }
  }
  if (rol === 'interventoria' || rol === 'operativo interventoria') {
    return { puedeValidar: true, lado: 2, esDev: false, niveles: [2] }
  }
  if (rol === 'contratista' || rol === 'operativo contratista' || rol === 'subcontratista') {
    return { puedeValidar: true, lado: 1, esDev: false, niveles: [1] }
  }
  if (cargo.includes('topograf')) {
    if (cargo.includes('intervent')) {
      return { puedeValidar: true, lado: 2, esDev: false, niveles: [2] }
    }
    return { puedeValidar: true, lado: 1, esDev: false, niveles: [1] }
  }
  if (cargo.includes('cadenero')) {
    return { puedeValidar: true, lado: 1, esDev: false, niveles: [1] }
  }
  return { puedeValidar: false, lado: null, esDev: false, niveles: [] }
}
