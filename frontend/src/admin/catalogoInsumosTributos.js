/**
 * Desglose AIU / IVA del catálogo de insumos (solo captura; no redefine costos).
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

function numOrEmpty(v) {
  if (v == null || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : ''
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

export function tributosDesdeForm(aiuForm, ivaForm) {
  const aiu = {
    administracion: aiuForm.administracion === '' ? null : Number(aiuForm.administracion),
    imprevistos: aiuForm.imprevistos === '' ? null : Number(aiuForm.imprevistos),
    utilidad: aiuForm.utilidad === '' ? null : Number(aiuForm.utilidad),
    iva_utilidad: aiuForm.iva_utilidad === '' ? null : Number(aiuForm.iva_utilidad),
  }
  const iva = {
    porcentaje: ivaForm.porcentaje === '' ? null : Number(ivaForm.porcentaje),
    sobre: ivaForm.sobre || 'costo_base',
  }
  return normalizarTributos({ aiu, iva })
}

export function formAiuDesdeTributos(tributos) {
  const t = normalizarTributos(tributos)
  return {
    administracion: numOrEmpty(t.aiu.administracion),
    imprevistos: numOrEmpty(t.aiu.imprevistos),
    utilidad: numOrEmpty(t.aiu.utilidad),
    iva_utilidad: numOrEmpty(t.aiu.iva_utilidad),
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
  return ['administracion', 'imprevistos', 'utilidad', 'iva_utilidad'].some(
    (k) => aiu[k] != null && aiu[k] !== '' && Number.isFinite(Number(aiu[k])),
  )
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
    if (t.aiu.imprevistos != null) bits.push(`I ${t.aiu.imprevistos}%`)
    if (t.aiu.utilidad != null) bits.push(`U ${t.aiu.utilidad}%`)
    if (t.aiu.iva_utilidad != null) bits.push(`IVA/U ${t.aiu.iva_utilidad}%`)
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
    // Legado: un solo % AIU → se carga en Utilidad como punto de partida editable.
    return normalizarTributos({
      aiu: { administracion: null, imprevistos: null, utilidad: pct, iva_utilidad: null },
    })
  }
  return normalizarTributos(row?.tributos)
}
