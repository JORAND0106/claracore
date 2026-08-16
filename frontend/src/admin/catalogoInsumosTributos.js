/**
 * Desglose AIU / IVA del catálogo de insumos (solo captura; no redefine costos).
 *
 * Convención:
 * - En BD / tributos: porcentajes en puntos (5 = 5%).
 * - En el modal AIU: el usuario digita fracción decimal (0.05) y la UI muestra % (5%).
 * - El modal IVA sigue en puntos porcentuales (sin cambio de UX).
 */

export const IVA_SOBRE_OPCIONES = [
  { id: 'costo_base', label: 'Costo base del insumo' },
  { id: 'utilidad', label: 'Utilidad (componente U del AIU)' },
  { id: 'aiu', label: 'AIU total (A + I + U)' },
  { id: 'costo_mas_aiu', label: 'Costo base + AIU' },
]

export const EMPTY_AIU = {
  administracion: '',
  imprevistos: '',
  utilidad: '',
  iva_utilidad: '',
}

export const EMPTY_IVA = {
  porcentaje: '',
  sobre: 'costo_base',
}

/** Etiquetas cortas del modal AIU. */
export const AIU_CAMPOS_UI = [
  { key: 'administracion', label: 'A.' },
  { key: 'imprevistos', label: 'Í.' },
  { key: 'utilidad', label: 'U.' },
  { key: 'iva_utilidad', label: 'IVA/Util.' },
]

function numOrEmpty(v) {
  if (v == null || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : ''
}

/** Fracción decimal (0.05) → puntos % (5). */
export function decimalAPuntosPct(raw) {
  if (raw === '' || raw == null) return null
  const n = Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 10000) / 100
}

/** Puntos % (5) → fracción decimal para el input (0.05). */
export function puntosPctADecimal(raw) {
  if (raw === '' || raw == null) return ''
  const n = Number(raw)
  if (!Number.isFinite(n)) return ''
  const d = Math.round((n / 100) * 1e8) / 1e8
  return String(d)
}

/** Texto de visualización % a partir del decimal digitado. */
export function fmtPctDesdeDecimal(raw) {
  const pts = decimalAPuntosPct(raw)
  if (pts == null) return '—'
  const pretty = Number.isInteger(pts) ? String(pts) : String(pts)
  return `${pretty}%`
}

/** Sumatoria A+I+U en puntos % (IVA/Util no entra en el total AIU). */
export function sumatoriaAiuPuntosPct(aiuForm) {
  const keys = ['administracion', 'imprevistos', 'utilidad']
  let sum = 0
  let any = false
  for (const k of keys) {
    const pts = decimalAPuntosPct(aiuForm?.[k])
    if (pts == null) continue
    any = true
    sum += pts
  }
  if (!any) return null
  return Math.round(sum * 100) / 100
}

export function fmtSumatoriaAiu(aiuForm) {
  const s = sumatoriaAiuPuntosPct(aiuForm)
  if (s == null) return '—'
  return `${s}%`
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

export function normalizarTributos(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const aiuIn = src.aiu && typeof src.aiu === 'object' ? src.aiu : {}
  const ivaIn = src.iva && typeof src.iva === 'object' ? src.iva : {}
  const sobre = String(ivaIn.sobre || 'costo_base').trim()
  const sobreOk = IVA_SOBRE_OPCIONES.some((o) => o.id === sobre) ? sobre : 'costo_base'
  return {
    aiu: {
      administracion: aiuIn.administracion != null && aiuIn.administracion !== '' ? Number(aiuIn.administracion) : null,
      imprevistos: aiuIn.imprevistos != null && aiuIn.imprevistos !== '' ? Number(aiuIn.imprevistos) : null,
      utilidad: aiuIn.utilidad != null && aiuIn.utilidad !== '' ? Number(aiuIn.utilidad) : null,
      iva_utilidad: aiuIn.iva_utilidad != null && aiuIn.iva_utilidad !== '' ? Number(aiuIn.iva_utilidad) : null,
    },
    iva: {
      porcentaje: ivaIn.porcentaje != null && ivaIn.porcentaje !== '' ? Number(ivaIn.porcentaje) : null,
      sobre: sobreOk,
    },
  }
}

/** Form AIU en decimales → tributos en puntos %. IVA del form ya viene en puntos %. */
export function tributosDesdeForm(aiuForm, ivaForm) {
  const aiu = {
    administracion: decimalAPuntosPct(aiuForm?.administracion),
    imprevistos: decimalAPuntosPct(aiuForm?.imprevistos),
    utilidad: decimalAPuntosPct(aiuForm?.utilidad),
    iva_utilidad: decimalAPuntosPct(aiuForm?.iva_utilidad),
  }
  const iva = {
    porcentaje: ivaForm?.porcentaje === '' || ivaForm?.porcentaje == null
      ? null
      : Number(ivaForm.porcentaje),
    sobre: ivaForm?.sobre || 'costo_base',
  }
  return normalizarTributos({ aiu, iva })
}

export function formAiuDesdeTributos(tributos) {
  const t = normalizarTributos(tributos)
  return {
    administracion: puntosPctADecimal(t.aiu.administracion),
    imprevistos: puntosPctADecimal(t.aiu.imprevistos),
    utilidad: puntosPctADecimal(t.aiu.utilidad),
    iva_utilidad: puntosPctADecimal(t.aiu.iva_utilidad),
  }
}

export function formIvaDesdeTributos(tributos) {
  const t = normalizarTributos(tributos)
  return {
    porcentaje: numOrEmpty(t.iva.porcentaje),
    sobre: t.iva.sobre || 'costo_base',
  }
}

export function aiuTieneDatos(aiu) {
  if (!aiu) return false
  // Acepta form decimal o tributos en puntos %
  return ['administracion', 'imprevistos', 'utilidad', 'iva_utilidad'].some((k) => {
    const v = aiu[k]
    if (v == null || v === '') return false
    return Number.isFinite(Number(v))
  })
}

export function ivaTieneDatos(iva) {
  if (!iva) return false
  return iva.porcentaje != null && iva.porcentaje !== '' && Number.isFinite(Number(iva.porcentaje))
}

export function etiquetaTributos(tributos, tipoImpuesto, impuestoPorcentaje) {
  const t = normalizarTributos(tributos)
  const parts = []
  if (aiuTieneDatos(t.aiu)) {
    const bits = []
    if (t.aiu.administracion != null) bits.push(`A ${t.aiu.administracion}%`)
    if (t.aiu.imprevistos != null) bits.push(`Í ${t.aiu.imprevistos}%`)
    if (t.aiu.utilidad != null) bits.push(`U ${t.aiu.utilidad}%`)
    if (t.aiu.iva_utilidad != null) bits.push(`IVA/Util ${t.aiu.iva_utilidad}%`)
    parts.push(`AIU (${bits.join(' · ')})`)
  }
  if (ivaTieneDatos(t.iva)) {
    const opt = IVA_SOBRE_OPCIONES.find((o) => o.id === t.iva.sobre)
    parts.push(`IVA ${t.iva.porcentaje}% · ${opt?.label || t.iva.sobre}`)
  }
  if (parts.length) return parts.join(' | ')
  const tipo = String(tipoImpuesto || '').toLowerCase()
  const pct = Number(impuestoPorcentaje) || 0
  if (tipo === 'iva' && pct) return `IVA ${pct}%`
  if (tipo === 'aiu' && pct) return `AIU ${pct}%`
  return '—'
}

/** Migra legado (tipo_impuesto único) a formularios AIU/IVA si aún no hay tributos. */
export function seedTributosDesdeLegado(row) {
  if (row?.tributos && (aiuTieneDatos(row.tributos.aiu) || ivaTieneDatos(row.tributos.iva))) {
    return normalizarTributos(row.tributos)
  }
  const tipo = String(row?.tipo_impuesto || '').toLowerCase()
  const pct = row?.impuesto_porcentaje
  if (tipo === 'iva' && pct != null && pct !== '') {
    return normalizarTributos({ iva: { porcentaje: pct, sobre: 'costo_base' } })
  }
  if (tipo === 'aiu' && pct != null && pct !== '') {
    return normalizarTributos({
      aiu: { administracion: null, imprevistos: null, utilidad: pct, iva_utilidad: null },
    })
  }
  return normalizarTributos(row?.tributos)
}
