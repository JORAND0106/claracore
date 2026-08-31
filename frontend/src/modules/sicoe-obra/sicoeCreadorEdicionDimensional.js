/**
 * Permiso mixto «Crear» (Reporte de Cantidades): creación + edición dimensional
 * del registro propio. Independiente del permiso «Editar» (financieros/clasificación).
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
 * Dimensiones vía permiso mixto Crear (creador) O vía permiso Editar (alcance completo).
 * Sin dependencia cruzada: Crear no consulta Editar y Editar no depende de Crear.
 */
export function sicoePuedeEditarCamposDimensionales({
  puedeEditar = false,
  puedeCrear = false,
  esCreador = false,
  selladoMax = false,
} = {}) {
  if (selladoMax) return false
  // Editar: alcance propio (incluye dims + financieros).
  if (puedeEditar) return true
  // Crear (mixto): solo dims del registro propio.
  return !!(puedeCrear && esCreador)
}

/** Capítulos / ítem / valores: solo permiso Editar y no sellado. */
export function sicoePuedeEditarCamposFinancieros({
  puedeEditar = false,
  selladoMax = false,
} = {}) {
  return !!(puedeEditar && !selladoMax)
}

/**
 * «+ Nuevo Registro» dentro de un reporte ya enviado.
 * Disponible con Crear (mixto) o Editar. No depende del sellado de otras líneas:
 * el registro nuevo nace pendiente; el sellado aplica a cada línea por separado.
 */
export function sicoePuedeAgregarRegistroEnReporte({
  puedeCrear = false,
  puedeEditar = false,
} = {}) {
  return !!(puedeCrear || puedeEditar)
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

export function sicoeNivelMaxAprobadoAlcanzado(registro, nivelesActivos) {
  const activos = (Array.isArray(nivelesActivos) && nivelesActivos.length
    ? nivelesActivos
    : [1, 2, 3]
  )
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 6)
    .sort((a, b) => a - b)
  let maxN = null
  for (const n of activos) {
    if ((registro?.[`nivel${n}_estado`] || '').trim() === 'Aprobado') maxN = n
  }
  return maxN
}

/**
 * Alerta visible desde N1 hasta cantidad_alerta_nivel_max_previo (inclusive).
 * Se oculta cuando el mayor nivel re-aprobado es >= ese máximo previo
 * (p. ej. max_prev=2 → tras re-aprobar N2; N3 ya no la ve).
 */
export function sicoeAlertaCantidadVisible(registro, nivelesActivos) {
  if (registro == null) return false
  const ant = registro.cantidad_alerta_anterior
  const act = registro.cantidad_alerta_actual
  if (ant == null || act == null) return false
  let maxPrev = registro.cantidad_alerta_nivel_max_previo
  if (maxPrev == null || String(maxPrev).trim() === '') return false
  maxPrev = Number(maxPrev)
  if (!Number.isFinite(maxPrev) || maxPrev < 1) return false
  const maxAprobadoAhora = sicoeNivelMaxAprobadoAlcanzado(registro, nivelesActivos)
  if (maxAprobadoAhora != null && maxAprobadoAhora >= maxPrev) return false
  return true
}

export function sicoeFormatearAlertaCantidad(registro, nivelesActivos) {
  if (!sicoeAlertaCantidadVisible(registro, nivelesActivos)) return null
  const a = Number(registro.cantidad_alerta_anterior)
  const b = Number(registro.cantidad_alerta_actual)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  const maxPrev = Number(registro.cantidad_alerta_nivel_max_previo)
  return {
    anterior: a,
    actual: b,
    nivelMaxPrevio: maxPrev,
    texto: `Cantidad anterior: ${a.toFixed(2)} → Cantidad actual: ${b.toFixed(2)}`,
  }
}
