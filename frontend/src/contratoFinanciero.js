/**
 * Valor total del contrato y confrontación con el presupuesto.
 *
 * Alcance del valor total que hoy muestra el módulo de Presupuesto
 * (versionador y comparador, «Directo + AIU»):
 * - Costo directo: suma de costo_directo de Presupuesto de Obra no dado de baja.
 *   La versión vigente lee el presupuesto vivo; una versión sellada, su snapshot.
 * - AIU: la tasa del contrato (fracción 0–1) aplicada sobre ese costo directo.
 * No incluye componente ambiental, componente social, componente PMT,
 * costos adicionales, IVA ni anticipo.
 *
 * La confrontación usa solo costo directo + AIU en ambos lados.
 */

export const ALCANCE_COMPARACION_PRESUPUESTO = 'Costo directo + AIU'

/** Componentes del «Directo + AIU» del módulo de Presupuesto. */
export const COMPONENTES_VALOR_PRESUPUESTO = Object.freeze([
  'Costo directo',
  'AIU',
])

/** Presentes en el valor total del contrato y ausentes del total del presupuesto. */
export const COMPONENTES_SOLO_CONTRATO = Object.freeze([
  'Componente ambiental',
  'Componente social',
  'Componente PMT',
  'Costos adicionales',
])

export function numFinanciero(value) {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Pesos enteros (mitad hacia arriba en positivos, igual que Math.round). */
export function roundCop0(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

/**
 * AIU = tasa (fracción) × costo directo, redondeado a 0 decimales.
 * La tasa se toma a 4 decimales (step del formulario) para evitar error binario.
 */
export function aiuSobreCostoDirecto(costoDirecto, tasaFraccion) {
  const cd = roundCop0(costoDirecto)
  const tasa = numFinanciero(tasaFraccion)
  if (cd === 0 || tasa == null || tasa === 0) return 0
  const tasa4 = Math.round(tasa * 10000)
  if (!tasa4) return 0
  return Math.round((cd * tasa4) / 10000)
}

/** Total de un renglón de costo adicional: valor mensual × meses, a 0 decimales. */
export function costoAdicionalFila(row) {
  if (!row || typeof row !== 'object') return 0
  const vm = numFinanciero(row.valor_mensual)
  const tm = numFinanciero(row.tiempo_meses)
  if (vm != null && tm != null) return Math.round(vm * tm)
  const legado = numFinanciero(row.valor)
  return legado == null ? 0 : roundCop0(legado)
}

export function sumaCostosAdicionales(lista) {
  if (!Array.isArray(lista)) return 0
  return lista.reduce((s, row) => s + costoAdicionalFila(row), 0)
}

/**
 * Valor total del contrato.
 * Costo directo + AIU + ambiental + social + PMT + costos adicionales.
 * El anticipo no se descuenta. El IVA no entra en el total.
 */
export function desgloseValorContrato(form) {
  const src = form || {}
  const costoDirecto = roundCop0(numFinanciero(src.costo_directo_contrato) ?? 0)
  const aiu = aiuSobreCostoDirecto(costoDirecto, src.aiu)
  const ambiental = roundCop0(numFinanciero(src.valor_componente_ambiental) ?? 0)
  const social = roundCop0(numFinanciero(src.valor_componente_social) ?? 0)
  const pmt = roundCop0(numFinanciero(src.valor_componente_pmt) ?? 0)
  const adicionales = sumaCostosAdicionales(src.costos_adicionales_lista)
  const total = costoDirecto + aiu + ambiental + social + pmt + adicionales
  return {
    costoDirecto,
    aiu,
    ambiental,
    social,
    pmt,
    adicionales,
    total,
    /** Mismo alcance que el total del presupuesto: costo directo + AIU. */
    comparable: costoDirecto + aiu,
  }
}

export function esVersionInicialPresupuesto(version, versiones) {
  if (!version) return false
  const tipo = String(version.snapshot_tipo || '').trim().toLowerCase()
  if (tipo === 'inicial') return true
  const lista = Array.isArray(versiones) ? versiones : []
  const marcadas = lista.filter((v) => String(v?.snapshot_tipo || '').trim().toLowerCase() === 'inicial')
  if (marcadas.length) return false
  const nums = lista
    .map((v) => Number(v?.numero_version))
    .filter((n) => Number.isFinite(n))
  if (!nums.length) return false
  const min = Math.min(...nums)
  return Number(version.numero_version) === min
}

/**
 * Versión vigente para la confrontación: la actualizada más reciente
 * (mayor numero_version distinta de V0) o, si no hay actualizaciones, V0.
 */
export function elegirVersionPresupuestoComparacion(versiones) {
  const lista = Array.isArray(versiones) ? versiones.filter(Boolean) : []
  if (!lista.length) return null
  const inicial = lista.find((v) => esVersionInicialPresupuesto(v, lista)) || null
  const actualizadas = lista.filter((v) => v !== inicial && !esVersionInicialPresupuesto(v, lista))
  if (!actualizadas.length) return inicial
  return actualizadas.reduce((mejor, v) => {
    const na = Number(mejor?.numero_version) || 0
    const nb = Number(v?.numero_version) || 0
    if (nb !== na) return nb > na ? v : mejor
    const ta = Date.parse(mejor?.creada_en || '') || 0
    const tb = Date.parse(v?.creada_en || '') || 0
    return tb >= ta ? v : mejor
  })
}

export function etiquetaVersionPresupuesto(version, versiones) {
  if (!version) return 'sin versión'
  const inicial = esVersionInicialPresupuesto(version, versiones)
  const et = String(version.etiqueta || '').trim()
  if (inicial) {
    if (!et || /^inicial$/i.test(et) || /^v0$/i.test(et)) return 'V0'
    return `${et} (V0)`
  }
  if (et) return et
  const num = version.numero_version
  return num != null && num !== '' ? `V${num}` : 'versión actualizada'
}

/**
 * Confronta costo directo + AIU del contrato con el de la versión vigente del presupuesto.
 * `coincide` es null cuando no hay versión con la cual comparar (no se muestra alerta).
 */
export function confrontarContratoPresupuesto(contrato, versiones) {
  const desglose = desgloseValorContrato(contrato)
  const version = elegirVersionPresupuestoComparacion(versiones)
  if (!version) {
    return {
      comparable: false,
      coincide: null,
      etiquetaVersion: null,
      valorContrato: desglose.comparable,
      valorPresupuesto: null,
      diferencia: null,
      alcance: ALCANCE_COMPARACION_PRESUPUESTO,
      desglose,
    }
  }
  const cdPpto = roundCop0(numFinanciero(version.costo_directo_total) ?? 0)
  const valorPresupuesto = cdPpto + aiuSobreCostoDirecto(cdPpto, contrato?.aiu)
  const valorContrato = desglose.comparable
  const diferencia = valorPresupuesto - valorContrato
  return {
    comparable: true,
    coincide: diferencia === 0,
    etiquetaVersion: etiquetaVersionPresupuesto(version, versiones),
    numeroVersion: version.numero_version ?? null,
    esInicial: esVersionInicialPresupuesto(version, versiones),
    valorContrato,
    valorPresupuesto,
    diferencia,
    costoDirectoPresupuesto: cdPpto,
    alcance: ALCANCE_COMPARACION_PRESUPUESTO,
    desglose,
  }
}

export function textoAlertaConfrontacion(confrontacion) {
  if (!confrontacion || confrontacion.coincide !== false) return ''
  const version = confrontacion.etiquetaVersion || 'vigente'
  const dif = Number(confrontacion.diferencia) || 0
  const quien = dif > 0 ? 'el presupuesto es mayor' : 'el contrato es mayor'
  return (
    `El costo directo + AIU del contrato no coincide con el presupuesto ${version}. `
    + `Contrato: ${confrontacion.valorContrato}. `
    + `Presupuesto ${version}: ${confrontacion.valorPresupuesto}. `
    + `Diferencia: ${Math.abs(dif)} (${quien}).`
  )
}
