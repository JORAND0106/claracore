/**
 * Impuesto unificado por insumo: Tipo | A | Í | U | IVA
 *
 * Convención:
 * - En BD / tributos: porcentajes en puntos (5 = 5%).
 * - En UI: el usuario digita fracción decimal (0.05) y se muestra en % (5%).
 *
 * Inferencia automática del tipo (no seleccionable):
 * - Solo IVA → IVA Pleno (sobre costo base)
 * - A/Í/U + IVA → IVA sobre Utilidad
 * - Solo A/Í/U → AIU (sin IVA)
 */

export const TIPO_IMPUESTO = {
  IVA_PLENO: 'iva_pleno',
  IVA_SOBRE_UTILIDAD: 'iva_sobre_utilidad',
  AIU_SIN_IVA: 'aiu_sin_iva',
}

export const TIPO_IMPUESTO_LABEL = {
  [TIPO_IMPUESTO.IVA_PLENO]: 'IVA Pleno',
  [TIPO_IMPUESTO.IVA_SOBRE_UTILIDAD]: 'IVA sobre Utilidad',
  [TIPO_IMPUESTO.AIU_SIN_IVA]: 'AIU (sin IVA)',
}

/** Formulario unificado (valores en decimal para A/Í/U/IVA). */
export const EMPTY_IMPUESTO = {
  administracion: '',
  imprevistos: '',
  utilidad: '',
  iva: '',
}

export const IMPUESTO_CAMPOS_UI = [
  { key: 'administracion', label: 'A.' },
  { key: 'imprevistos', label: 'Í.' },
  { key: 'utilidad', label: 'U.' },
  { key: 'iva', label: 'IVA' },
]

/** @deprecated usar EMPTY_IMPUESTO / IMPUESTO_CAMPOS_UI */
export const EMPTY_AIU = {
  administracion: '',
  imprevistos: '',
  utilidad: '',
  iva_utilidad: '',
}

/** @deprecated */
export const AIU_CAMPOS_UI = [
  { key: 'administracion', label: 'A.' },
  { key: 'imprevistos', label: 'Í.' },
  { key: 'utilidad', label: 'U.' },
  { key: 'iva_utilidad', label: 'IVA' },
]

/** @deprecated */
export const EMPTY_IVA = { porcentaje: '', sobre: 'costo_base' }

/** @deprecated */
export const IVA_SOBRE_OPCIONES = [
  { id: 'costo_base', label: 'Costo base del insumo' },
  { id: 'utilidad', label: 'Utilidad (componente U del AIU)' },
  { id: 'aiu', label: 'AIU total (A + I + U)' },
  { id: 'costo_mas_aiu', label: 'Costo base + AIU' },
]

/**
 * ─── Reglas de redondeo (no mezclar) ─────────────────────────────────────────
 *
 * 1) Porcentajes A / Í / U / IVA y Total efectivo:
 *    Se muestran con todos los decimales. Total = A+Í+(U+U×IVA) si IVA sobre
 *    Utilidad; solo IVA si IVA Pleno; A+Í+U si AIU sin IVA.
 *    NUNCA usar fmtMoney ni Math.round a enteros.
 *
 * 2) Montos COP (Costo Directo, Valor después de AIU/IVA):
 *    Se redondean a 0 decimales (enteros). Usar computeValorDespuesAiuIva + fmtMoney.
 */

/** Fracción decimal (0.05) → puntos % (5) para persistencia/API (sin truncar a entero). */
export function decimalAPuntosPct(raw) {
  if (raw === '' || raw == null) return null
  const n = Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  // Conserva decimales de la fracción×100; solo limpia ruido binario.
  return Number((n * 100).toFixed(10))
}

/** Puntos % (5) → fracción decimal para el input (0.05). */
export function puntosPctADecimal(raw) {
  if (raw === '' || raw == null) return ''
  const n = Number(raw)
  if (!Number.isFinite(n)) return ''
  // Exacto en la medida de float; sin forzar redondeo a 2 dp.
  const d = Number((n / 100).toFixed(12))
  return String(d)
}

/**
 * Fracción decimal → puntos % exactos para UI (sin redondeo de negocio).
 * No usar para montos COP.
 */
export function puntosPctExactosDesdeFraccion(raw) {
  if (raw === '' || raw == null) return null
  const n = Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return Number((n * 100).toFixed(10))
}

/** Formatea puntos % sin forzar redondeo; elimina solo ceros finales / ruido FP. */
export function formatPuntosPctExacto(pts) {
  if (pts == null || !Number.isFinite(Number(pts))) return '—'
  const n = Number(pts)
  let s = n.toFixed(10).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
  if (s === '-0') s = '0'
  return s
}

/**
 * Equivalente % de un campo A/Í/U/IVA en el modal (UI).
 * Completo, con decimales — nunca entero COP / fmtMoney.
 */
export function fmtPctDesdeDecimal(raw) {
  const pts = puntosPctExactosDesdeFraccion(raw)
  if (pts == null) return '—'
  return `${formatPuntosPctExacto(pts)}%`
}

/**
 * Total porcentual efectivo del impuesto (UI), sin redondear.
 *
 * - IVA sobre Utilidad: A + Í + (U + U×IVA)
 *   ej. 5 + 2 + (5 + 5×0.19) = 12.95
 * - IVA Pleno: solo IVA
 * - AIU sin IVA: A + Í + U
 *
 * @param {object} form — fracciones decimales del formulario
 * @returns {number|null} puntos %
 */
export function sumatoriaAiuPuntosPct(form) {
  const frac = (raw) => {
    if (raw === '' || raw == null) return null
    const n = Number(String(raw).replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return null
    return n
  }
  const a = frac(form?.administracion)
  const i = frac(form?.imprevistos)
  const u = frac(form?.utilidad)
  const iva = frac(form?.iva)
  const tipo = inferirTipoImpuesto(form, { valoresEnDecimal: true })

  if (tipo === TIPO_IMPUESTO.IVA_PLENO) {
    if (iva == null) return null
    return Number((iva * 100).toFixed(10))
  }
  if (tipo === TIPO_IMPUESTO.IVA_SOBRE_UTILIDAD) {
    const af = a ?? 0
    const iF = i ?? 0
    const uF = u ?? 0
    const ivaF = iva ?? 0
    // A + I + (U + U×IVA) en fracción → puntos %
    const totalFrac = af + iF + (uF + uF * ivaF)
    return Number((totalFrac * 100).toFixed(10))
  }
  if (tipo === TIPO_IMPUESTO.AIU_SIN_IVA) {
    const af = a ?? 0
    const iF = i ?? 0
    const uF = u ?? 0
    return Number(((af + iF + uF) * 100).toFixed(10))
  }
  return null
}

/** Total % efectivo para UI — exacto, nunca fmtMoney. */
export function fmtSumatoriaAiu(form) {
  const s = sumatoriaAiuPuntosPct(form)
  if (s == null) return '—'
  return `${formatPuntosPctExacto(s)}%`
}

/** Tooltip corto de la fórmula del total según tipo. */
export function tooltipTotalPorcentaje(form) {
  const tipo = inferirTipoImpuesto(form, { valoresEnDecimal: true })
  if (tipo === TIPO_IMPUESTO.IVA_SOBRE_UTILIDAD) {
    return 'A + Í + (U + U×IVA) — sin redondear'
  }
  if (tipo === TIPO_IMPUESTO.IVA_PLENO) {
    return 'IVA pleno — sin redondear'
  }
  if (tipo === TIPO_IMPUESTO.AIU_SIN_IVA) {
    return 'A + Í + U — sin redondear'
  }
  return 'Total porcentual efectivo'
}

/**
 * CSV / entrada libre → puntos %.
 * ≤ 1 se interpreta como fracción decimal; > 1 como puntos ya en %.
 */
export function parseEntradaAPuntosPct(raw) {
  if (raw === '' || raw == null) return null
  const cleaned = String(raw).trim().replace('%', '').replace(',', '.')
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return null
  if (n <= 1) return Math.round(n * 10000) / 100
  return Math.round(n * 100) / 100
}

function tieneValorPct(v) {
  return v != null && v !== '' && Number.isFinite(Number(v))
}

function numOrNull(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** ¿Hay A, Í o U? (no cuenta IVA). */
export function tieneAiuComponentes(obj) {
  if (!obj) return false
  return ['administracion', 'imprevistos', 'utilidad'].some((k) => tieneValorPct(obj[k]))
}

/**
 * Inferencia automática del tipo de impuesto.
 * @param {{ administracion?, imprevistos?, utilidad?, iva? }} vals — puntos % o decimales del form
 * @param {{ valoresEnDecimal?: boolean }} [opts]
 */
export function inferirTipoImpuesto(vals, opts = {}) {
  const toPts = opts.valoresEnDecimal
    ? (v) => decimalAPuntosPct(v)
    : (v) => (tieneValorPct(v) ? Number(v) : null)
  const a = toPts(vals?.administracion)
  const i = toPts(vals?.imprevistos)
  const u = toPts(vals?.utilidad)
  const iva = toPts(vals?.iva)
  const tieneAiu = a != null || i != null || u != null
  const tieneIva = iva != null
  if (tieneAiu && tieneIva) return TIPO_IMPUESTO.IVA_SOBRE_UTILIDAD
  if (!tieneAiu && tieneIva) return TIPO_IMPUESTO.IVA_PLENO
  if (tieneAiu && !tieneIva) return TIPO_IMPUESTO.AIU_SIN_IVA
  return null
}

export function labelTipoImpuesto(tipo) {
  if (!tipo) return '—'
  return TIPO_IMPUESTO_LABEL[tipo] || tipo
}

/**
 * Normaliza tributos guardados (legado anidado o plano) → forma canónica + tipo inferido.
 * Shape: { tipo, administracion, imprevistos, utilidad, aiu, iva: { porcentaje, sobre } }
 */
export function normalizarTributos(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const aiuIn = src.aiu && typeof src.aiu === 'object' ? src.aiu : {}
  const ivaIn = src.iva && typeof src.iva === 'object' ? src.iva : {}

  let administracion = numOrNull(
    src.administracion != null && src.administracion !== ''
      ? src.administracion
      : aiuIn.administracion,
  )
  let imprevistos = numOrNull(
    src.imprevistos != null && src.imprevistos !== ''
      ? src.imprevistos
      : aiuIn.imprevistos,
  )
  let utilidad = numOrNull(
    src.utilidad != null && src.utilidad !== ''
      ? src.utilidad
      : aiuIn.utilidad,
  )

  let iva = null
  if (src.iva != null && typeof src.iva !== 'object' && src.iva !== '') {
    iva = numOrNull(src.iva)
  } else if (ivaIn.porcentaje != null && ivaIn.porcentaje !== '') {
    iva = numOrNull(ivaIn.porcentaje)
  } else if (aiuIn.iva_utilidad != null && aiuIn.iva_utilidad !== '') {
    iva = numOrNull(aiuIn.iva_utilidad)
  }

  const tipo = inferirTipoImpuesto({
    administracion, imprevistos, utilidad, iva,
  })

  const sobre = tipo === TIPO_IMPUESTO.IVA_SOBRE_UTILIDAD ? 'utilidad' : 'costo_base'

  return {
    tipo,
    administracion,
    imprevistos,
    utilidad,
    aiu: {
      administracion,
      imprevistos,
      utilidad,
      iva_utilidad: tipo === TIPO_IMPUESTO.IVA_SOBRE_UTILIDAD ? iva : null,
    },
    iva: {
      porcentaje: iva,
      sobre,
    },
  }
}

/** Serializa al shape que el backend `normalize_tributos` espera. */
export function tributosPayloadDesdeForm(impuestoForm) {
  const administracion = decimalAPuntosPct(impuestoForm?.administracion)
  const imprevistos = decimalAPuntosPct(impuestoForm?.imprevistos)
  const utilidad = decimalAPuntosPct(impuestoForm?.utilidad)
  const ivaPts = decimalAPuntosPct(impuestoForm?.iva)
  return normalizarTributos({
    administracion,
    imprevistos,
    utilidad,
    iva: ivaPts,
  })
}

/** @deprecated usar tributosPayloadDesdeForm */
export function tributosDesdeForm(aiuForm, ivaForm) {
  if (aiuForm && Object.prototype.hasOwnProperty.call(aiuForm, 'iva') && ivaForm == null) {
    return tributosPayloadDesdeForm(aiuForm)
  }
  // Form unificado ya tiene iva en decimal; legado: iva_utilidad o iva.porcentaje en puntos.
  let ivaDecimal = ''
  if (aiuForm?.iva != null && aiuForm.iva !== '') {
    ivaDecimal = aiuForm.iva
  } else if (aiuForm?.iva_utilidad != null && aiuForm.iva_utilidad !== '') {
    ivaDecimal = aiuForm.iva_utilidad
  } else if (ivaForm?.porcentaje != null && ivaForm.porcentaje !== '') {
    // El modal IVA antiguo pedía puntos %; convertir a decimal de form.
    ivaDecimal = puntosPctADecimal(ivaForm.porcentaje)
  }
  return tributosPayloadDesdeForm({
    administracion: aiuForm?.administracion ?? '',
    imprevistos: aiuForm?.imprevistos ?? '',
    utilidad: aiuForm?.utilidad ?? '',
    iva: ivaDecimal,
  })
}

export function formImpuestoDesdeTributos(tributos) {
  const t = normalizarTributos(tributos)
  return {
    administracion: puntosPctADecimal(t.administracion),
    imprevistos: puntosPctADecimal(t.imprevistos),
    utilidad: puntosPctADecimal(t.utilidad),
    iva: puntosPctADecimal(t.iva?.porcentaje),
  }
}

/** @deprecated */
export function formAiuDesdeTributos(tributos) {
  const f = formImpuestoDesdeTributos(tributos)
  return {
    administracion: f.administracion,
    imprevistos: f.imprevistos,
    utilidad: f.utilidad,
    iva_utilidad: f.iva,
  }
}

/** @deprecated */
export function formIvaDesdeTributos(tributos) {
  const t = normalizarTributos(tributos)
  return {
    porcentaje: t.iva?.porcentaje != null ? String(t.iva.porcentaje) : '',
    sobre: t.tipo === TIPO_IMPUESTO.IVA_SOBRE_UTILIDAD ? 'utilidad' : 'costo_base',
  }
}

export function aiuTieneDatos(aiu) {
  if (!aiu) return false
  return ['administracion', 'imprevistos', 'utilidad', 'iva', 'iva_utilidad'].some((k) => tieneValorPct(aiu[k]))
}

export function ivaTieneDatos(iva) {
  if (!iva) return false
  if (typeof iva !== 'object') return tieneValorPct(iva)
  return tieneValorPct(iva.porcentaje) || tieneValorPct(iva.iva)
}

export function impuestoTieneDatos(form) {
  return tieneAiuComponentes(form) || tieneValorPct(form?.iva)
}

/**
 * Valor unitario después de A/Í/U e IVA.
 * @param {number|string} costoBase — valor antes de AIU/IVA
 * @param {object} tributosOrForm — tributos normalizados o form decimal (si opts.valoresEnDecimal)
 * @param {{ valoresEnDecimal?: boolean }} [opts]
 */
export function computeValorDespuesAiuIva(costoBase, tributosOrForm, opts = {}) {
  const base = Math.max(Number(costoBase) || 0, 0)
  let t
  if (opts.valoresEnDecimal) {
    t = tributosPayloadDesdeForm(tributosOrForm || EMPTY_IMPUESTO)
  } else {
    t = normalizarTributos(tributosOrForm)
  }
  const a = (Number(t.administracion) || 0) / 100
  const i = (Number(t.imprevistos) || 0) / 100
  const u = (Number(t.utilidad) || 0) / 100
  const iva = (Number(t.iva?.porcentaje) || 0) / 100
  const tipo = t.tipo

  if (tipo === TIPO_IMPUESTO.IVA_PLENO) {
    return Math.round(base * (1 + iva))
  }
  if (tipo === TIPO_IMPUESTO.AIU_SIN_IVA) {
    return Math.round(base * (1 + a + i + u))
  }
  if (tipo === TIPO_IMPUESTO.IVA_SOBRE_UTILIDAD) {
    const aiuTotal = base * (a + i + u)
    const ivaUtil = base * u * iva
    return Math.round(base + aiuTotal + ivaUtil)
  }
  return Math.round(base)
}

export function etiquetaTributos(tributos, tipoImpuesto, impuestoPorcentaje) {
  const t = normalizarTributos(tributos)
  if (t.tipo || t.administracion != null || t.imprevistos != null || t.utilidad != null || t.iva?.porcentaje != null) {
    const bits = []
    if (t.tipo) bits.push(labelTipoImpuesto(t.tipo))
    if (t.administracion != null) bits.push(`A ${t.administracion}%`)
    if (t.imprevistos != null) bits.push(`Í ${t.imprevistos}%`)
    if (t.utilidad != null) bits.push(`U ${t.utilidad}%`)
    if (t.iva?.porcentaje != null) bits.push(`IVA ${t.iva.porcentaje}%`)
    return bits.join(' · ') || '—'
  }
  const tipo = String(tipoImpuesto || '').toLowerCase()
  const pct = Number(impuestoPorcentaje) || 0
  if (tipo === 'iva' && pct) return `IVA Pleno · IVA ${pct}%`
  if (tipo === 'aiu' && pct) return `AIU ${pct}%`
  return '—'
}

export function seedTributosDesdeLegado(row) {
  if (row?.tributos) {
    const t = normalizarTributos(row.tributos)
    if (t.tipo || t.administracion != null || t.iva?.porcentaje != null || t.utilidad != null || t.imprevistos != null) {
      return t
    }
  }
  const tipo = String(row?.tipo_impuesto || '').toLowerCase()
  const pct = row?.impuesto_porcentaje
  if (tipo === 'iva' && pct != null && pct !== '') {
    return normalizarTributos({ iva: { porcentaje: pct, sobre: 'costo_base' } })
  }
  if (tipo === 'aiu' && pct != null && pct !== '') {
    return normalizarTributos({
      aiu: { administracion: null, imprevistos: null, utilidad: pct },
    })
  }
  return normalizarTributos(row?.tributos)
}

/** Etiqueta corta para grilla: IVA | AIU | — */
export function tipoTributoCortoDesdeRow(row) {
  const trib = seedTributosDesdeLegado(row)
  const form = formImpuestoDesdeTributos(trib)
  const tipo = inferirTipoImpuesto(form, { valoresEnDecimal: true })
  if (!tipo) {
    const leg = String(row?.tipo_impuesto || '').toLowerCase()
    if (leg === 'iva') return 'IVA'
    if (leg === 'aiu') return 'AIU'
    return '—'
  }
  if (tipo === TIPO_IMPUESTO.IVA_PLENO) return 'IVA'
  return 'AIU'
}

/**
 * Valor tributario para grilla: % de IVA, o sumatoria AIU (según tipo).
 */
export function valorTributarioLabelDesdeRow(row) {
  const trib = seedTributosDesdeLegado(row)
  const form = formImpuestoDesdeTributos(trib)
  const pts = sumatoriaAiuPuntosPct(form)
  if (pts != null) return `${formatPuntosPctExacto(pts)}%`
  const pct = Number(row?.impuesto_porcentaje)
  if (Number.isFinite(pct) && pct > 0) return `${formatPuntosPctExacto(pct)}%`
  return '—'
}
