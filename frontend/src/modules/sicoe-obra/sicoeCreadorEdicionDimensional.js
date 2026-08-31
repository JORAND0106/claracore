/**
 * Edición dimensional por el creador del registro (permiso Crear),
 * independiente del permiso Editar (campos financieros/clasificación).
 */

export const SICOE_CAMPOS_DIMENSIONALES = Object.freeze([
  'longitud',
  'ancho',
  'espesor',
  'cantidad',
  'cantidad_total',
  'observacion',
  'abs_inicio',
  'abs_final',
  'nodo_ini',
  'nodo_fin',
  'margen',
  'pk_id_id',
  'civ',
  'tramo',
  'infraestructura',
  'calzada',
  'ubicacion',
  'coord_lat',
  'coord_lng',
])

export const SICOE_CAMPOS_FINANCIEROS = Object.freeze([
  'capitulo',
  'competencia',
  'item_numero',
  'item_descripcion',
  'unidad',
  'vlr_unitario',
  'costo_directo',
  'acta_rpo_id',
  'semana_id',
])

export function sicoeEsCreadorRegistro(usuario, registro) {
  if (!usuario || !registro) return false
  const uid = usuario.id ?? usuario.sub
  const creador = registro.creado_por_reg
  if (uid == null || creador == null) return false
  return String(uid) === String(creador)
}

/**
 * Dimensiones editables si no está sellado y (tiene Editar O es creador con Crear).
 * @param {{ puedeEditar?: boolean, puedeCrear?: boolean, esCreador?: boolean, selladoMax?: boolean }} opts
 */
export function sicoePuedeEditarCamposDimensionales({
  puedeEditar = false,
  puedeCrear = false,
  esCreador = false,
  selladoMax = false,
} = {}) {
  if (selladoMax) return false
  if (puedeEditar) return true
  return !!(puedeCrear && esCreador)
}

/** Capítulos / ítem / valores: solo permiso Editar y no sellado. */
export function sicoePuedeEditarCamposFinancieros({
  puedeEditar = false,
  selladoMax = false,
} = {}) {
  return !!(puedeEditar && !selladoMax)
}

export function sicoeCalcCantidadTotal(longitud, ancho, espesor, cantidad) {
  const isEmpty = (v) => v === '' || v === null || v === undefined
  if (isEmpty(longitud) && isEmpty(ancho) && isEmpty(espesor) && isEmpty(cantidad)) return 0
  const lv = !isEmpty(longitud) ? parseFloat(longitud) : 1
  const av = !isEmpty(ancho) ? parseFloat(ancho) : 1
  const ev = !isEmpty(espesor) ? parseFloat(espesor) : 1
  const cv = !isEmpty(cantidad) ? parseFloat(cantidad) : 1
  if ([lv, av, ev, cv].some((n) => Number.isNaN(n))) return 0
  return Math.round(lv * av * ev * cv * 100) / 100
}

export function sicoeCantidadCambioSignificativo(anterior, actual) {
  const a = Math.round(Number(anterior || 0) * 100) / 100
  const b = Math.round(Number(actual || 0) * 100) / 100
  return a !== b
}

export function sicoeFormatearAlertaCantidad(registro) {
  if (registro == null) return null
  const ant = registro.cantidad_alerta_anterior
  const act = registro.cantidad_alerta_actual
  if (ant == null || act == null) return null
  const a = Number(ant)
  const b = Number(act)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return {
    anterior: a,
    actual: b,
    texto: `Cantidad anterior: ${a.toFixed(2)} → Cantidad actual: ${b.toFixed(2)}`,
  }
}
