/**
 * Vista «Revisión vs listado»: un registro por fila y un solo impacto.
 * El API sigue entregando una inconsistencia por tipo; aquí se elige el caso
 * más relevante y la diferencia se cuenta una sola vez.
 */

export const CASO_TODOS = 'todos'
export const CASO_SIN_ITEM = 'sin_item'
export const CASO_PRECIO = 'precio_distinto'
export const CASO_NO_RECALC = 'valor_no_recalculado'
export const CASO_REDONDEO = 'redondeo'

/** Diferencias de decimales por debajo de este monto son redondeo. */
export const UMBRAL_REDONDEO_COP = 1000

export const SIN_VALORIZAR = 'Sin valorizar'

export const TARJETAS_REVISION = [
  { id: CASO_TODOS, label: 'Valor calculado con listado' },
  { id: CASO_SIN_ITEM, label: 'Sin ítem asignado' },
  { id: CASO_PRECIO, label: 'Precio distinto al listado' },
  { id: CASO_NO_RECALC, label: 'Valor no recalculado' },
  { id: CASO_REDONDEO, label: 'Redondeo' },
]

const ETIQUETA = Object.fromEntries(TARJETAS_REVISION.map((t) => [t.id, t.label]))

const RANK = {
  [CASO_SIN_ITEM]: 0,
  [CASO_PRECIO]: 1,
  [CASO_NO_RECALC]: 2,
  [CASO_REDONDEO]: 3,
}

const TIPOS_SIN_CRUCE = new Set([
  'sin_item',
  'sin_capitulo',
  'cap_item_ausente_en_listado',
])

function money(n) {
  if (n == null || n === '') return null
  const x = Number(n)
  return Number.isFinite(x) ? x : null
}

export function casoDeInconsistencia(inc) {
  const tipo = inc?.tipo
  if (TIPOS_SIN_CRUCE.has(tipo)) return CASO_SIN_ITEM
  if (tipo === 'vu_guardado_distinto_listado') return CASO_PRECIO
  if (tipo === 'cd_guardado_distinto_cant_x_vu') {
    const diff = Math.abs(money(inc.impacto_plata) || 0)
    return diff < UMBRAL_REDONDEO_COP ? CASO_REDONDEO : CASO_NO_RECALC
  }
  return null
}

function diferenciaDe(inc) {
  const guardado = money(inc?.cd_guardado)
  const listado = money(inc?.cd_esperado)
  if (guardado != null && listado != null) return Math.abs(guardado - listado)
  const impacto = money(inc?.impacto_plata)
  return impacto == null ? null : Math.abs(impacto)
}

function filaDesdeGrupo(grupo) {
  let elegido = null
  let rank = 99
  for (const inc of grupo) {
    const caso = casoDeInconsistencia(inc)
    if (!caso) continue
    if (RANK[caso] < rank) {
      elegido = { caso, inc }
      rank = RANK[caso]
    }
  }
  if (!elegido) return null
  const { caso, inc } = elegido
  const base = grupo[0] || inc
  const sinValorizar = caso === CASO_SIN_ITEM
  const diferencia = sinValorizar ? null : diferenciaDe(inc)
  return {
    registro_id: base.registro_id ?? inc.registro_id ?? null,
    numero_registro: base.numero_registro ?? inc.numero_registro ?? null,
    reporte_id: base.reporte_id ?? inc.reporte_id ?? null,
    numero_reporte: base.numero_reporte ?? inc.numero_reporte ?? null,
    item_numero: base.item_numero || inc.item_numero || '',
    caso,
    caso_label: ETIQUETA[caso],
    cantidad: money(inc.cantidad_total ?? base.cantidad_total),
    valor_guardado: sinValorizar ? null : money(inc.cd_guardado),
    valor_listado: sinValorizar ? null : money(inc.cd_esperado),
    diferencia,
    sin_valorizar: sinValorizar,
  }
}

function claveRegistro(inc, idx) {
  if (inc?.registro_id != null && inc.registro_id !== '') return `id:${inc.registro_id}`
  if (inc?.numero_registro != null && inc.numero_registro !== '') {
    return `n:${inc.numero_registro}:${inc.item_numero || ''}:${inc.capitulo || ''}`
  }
  return `i:${idx}`
}

/**
 * @param {Array<object>} inconsistencias
 * @param {number|null} valorCanonico valor del filtro (Σ canónico con listado)
 */
export function presentarRevisionListado(inconsistencias, valorCanonico) {
  const grupos = new Map()
  ;(inconsistencias || []).forEach((inc, idx) => {
    const key = claveRegistro(inc, idx)
    if (!grupos.has(key)) grupos.set(key, [])
    grupos.get(key).push(inc)
  })

  const filas = []
  for (const grupo of grupos.values()) {
    const fila = filaDesdeGrupo(grupo)
    if (fila) filas.push(fila)
  }

  filas.sort((a, b) => {
    const porCaso = RANK[a.caso] - RANK[b.caso]
    if (porCaso) return porCaso
    const da = a.diferencia == null ? -1 : a.diferencia
    const db = b.diferencia == null ? -1 : b.diferencia
    if (db !== da) return db - da
    const na = Number(a.numero_registro)
    const nb = Number(b.numero_registro)
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    return 0
  })

  const vacio = () => ({ n: 0, impacto: 0 })
  const porCaso = {
    [CASO_SIN_ITEM]: vacio(),
    [CASO_PRECIO]: vacio(),
    [CASO_NO_RECALC]: vacio(),
    [CASO_REDONDEO]: vacio(),
  }
  for (const fila of filas) {
    const bucket = porCaso[fila.caso]
    if (!bucket) continue
    bucket.n += 1
    if (fila.caso !== CASO_SIN_ITEM && fila.diferencia != null) {
      bucket.impacto += fila.diferencia
    }
  }
  for (const bucket of Object.values(porCaso)) {
    bucket.impacto = Math.round(bucket.impacto)
  }

  const canon = money(valorCanonico)
  return {
    filas,
    tarjetas: {
      valor_canonico: canon == null ? null : Math.round(canon),
      ...porCaso,
    },
  }
}
