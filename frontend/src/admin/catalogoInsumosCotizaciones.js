/**
 * Cotizaciones del catálogo: pares Insumo | No Previsto en la misma fila (comparación).
 */

function uid(prefix = 'p') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Copia el form de impuesto (decimales UI) en un lado de cotización. */
export function cloneImpuestoLado(imp) {
  if (!imp || typeof imp !== 'object') {
    return { administracion: '', imprevistos: '', utilidad: '', iva: '' }
  }
  return {
    administracion: imp.administracion != null && imp.administracion !== '' ? String(imp.administracion) : '',
    imprevistos: imp.imprevistos != null && imp.imprevistos !== '' ? String(imp.imprevistos) : '',
    utilidad: imp.utilidad != null && imp.utilidad !== '' ? String(imp.utilidad) : '',
    iva: imp.iva != null && imp.iva !== '' ? String(imp.iva) : '',
  }
}

export function ladoHasImpuesto(lado) {
  const imp = lado?.impuesto
  if (!imp || typeof imp !== 'object') return false
  return ['administracion', 'imprevistos', 'utilidad', 'iva'].some(
    (k) => imp[k] !== '' && imp[k] != null && Number(imp[k]) !== 0,
  )
}

export function emptyLado() {
  return {
    proveedor: '',
    valor: '',
    numero: '',
    fecha: '',
    vigencia: '',
    impuesto_etiqueta: '',
    impuesto: cloneImpuestoLado(null),
    pdf: null,
    pdf_nombre: '',
    pdf_historial: [],
  }
}

export function newCotizacionPar({ esGanadora = false } = {}) {
  return {
    id: uid('pair'),
    es_ganadora: !!esGanadora,
    insumo: emptyLado(),
    no_previsto: emptyLado(),
  }
}

/** @deprecated Prefer newCotizacionPar — se mantiene por compatibilidad de tests antiguos. */
export function newCotizacionRow(tipo = 'insumo', { esGanadora = false } = {}) {
  const lado = emptyLado()
  return {
    id: uid('c'),
    tipo: tipo === 'no_previsto' ? 'no_previsto' : 'insumo',
    es_ganadora: !!esGanadora && tipo !== 'no_previsto',
    ...lado,
  }
}

function ladoHasData(lado) {
  if (!lado) return false
  return !!(
    (lado.proveedor || '').trim()
    || (lado.numero || '').trim()
    || (lado.fecha || '').trim()
    || (lado.vigencia || '').trim()
    || (lado.valor !== '' && lado.valor != null)
    || (lado.impuesto_etiqueta || '').trim()
    || ladoHasImpuesto(lado)
    || lado.pdf
    || (lado.pdf_nombre || '').trim()
  )
}

/** Datos de captura en un lado (sin contar solo el PDF). */
export function ladoHasCaptureData(lado) {
  if (!lado) return false
  return !!(
    (lado.numero || '').trim()
    || (lado.fecha || '').trim()
    || (lado.vigencia || '').trim()
    || (lado.valor !== '' && lado.valor != null)
    || (lado.impuesto_etiqueta || '').trim()
    || ladoHasImpuesto(lado)
  )
}

function ladoHasPdf(lado) {
  return !!(lado?.pdf || (lado?.pdf_nombre || '').trim())
}

function rowHasData(r) {
  if (!r) return false
  if (r.insumo || r.no_previsto) {
    return !!(r.es_ganadora || ladoHasData(r.insumo) || ladoHasData(r.no_previsto))
  }
  return !!(
    r.es_ganadora
    || (r.proveedor || '').trim()
    || (r.numero || '').trim()
    || (r.fecha || '').trim()
    || (r.vigencia || '').trim()
    || (r.valor !== '' && r.valor != null)
    || r.pdf
    || (r.pdf_nombre || '').trim()
  )
}

function normalizeLado(item = {}) {
  const historial = Array.isArray(item?.pdf_historial)
    ? item.pdf_historial.map((h) => ({
      nombre: String(h?.nombre || ''),
      replaced_at: h?.replaced_at || null,
    })).filter((h) => h.nombre)
    : []
  return {
    proveedor: item?.proveedor != null ? String(item.proveedor) : '',
    valor: item?.valor != null && item.valor !== '' ? String(item.valor) : '',
    numero: item?.numero != null ? String(item.numero) : '',
    fecha: item?.fecha ? String(item.fecha).slice(0, 10) : '',
    vigencia: item?.vigencia != null ? String(item.vigencia) : '',
    impuesto_etiqueta: item?.impuesto_etiqueta != null ? String(item.impuesto_etiqueta) : '',
    impuesto: cloneImpuestoLado(item?.impuesto),
    pdf: item?.pdf || null,
    pdf_nombre: item?.pdf_nombre != null ? String(item.pdf_nombre) : '',
    pdf_historial: historial,
  }
}

/** Normaliza lista cruda (API o legado) a filas planas tipo=insumo|no_previsto. */
export function normalizeCotizacionesDetalle(raw) {
  if (!raw) return []
  let list = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  return list.map((item, i) => {
    const tipo = item?.tipo === 'no_previsto' ? 'no_previsto' : 'insumo'
    return {
      id: String(item?.id || `c-${i}`),
      pair_id: item?.pair_id ? String(item.pair_id) : null,
      tipo,
      es_ganadora: !!item?.es_ganadora && tipo === 'insumo',
      ...normalizeLado(item),
    }
  })
}

/**
 * Convierte detalle plano (API) a pares UI Insumo | No Previsto.
 * Empareja por pair_id; si no hay, empareja por orden relativo.
 */
export function detalleToPares(raw) {
  const flat = normalizeCotizacionesDetalle(raw)
  if (!flat.length) return []

  const byPair = new Map()
  const orphansInsumo = []
  const orphansNp = []

  for (const row of flat) {
    if (row.pair_id) {
      if (!byPair.has(row.pair_id)) {
        byPair.set(row.pair_id, {
          id: row.pair_id,
          es_ganadora: false,
          insumo: emptyLado(),
          no_previsto: emptyLado(),
        })
      }
      const par = byPair.get(row.pair_id)
      if (row.tipo === 'no_previsto') par.no_previsto = normalizeLado(row)
      else {
        par.insumo = normalizeLado(row)
        if (row.es_ganadora) par.es_ganadora = true
      }
    } else if (row.tipo === 'no_previsto') {
      orphansNp.push(row)
    } else {
      orphansInsumo.push(row)
    }
  }

  const pares = [...byPair.values()]
  const n = Math.max(orphansInsumo.length, orphansNp.length)
  for (let i = 0; i < n; i += 1) {
    const ins = orphansInsumo[i]
    const np = orphansNp[i]
    pares.push({
      id: uid('pair'),
      es_ganadora: !!(ins && ins.es_ganadora),
      insumo: ins ? normalizeLado(ins) : emptyLado(),
      no_previsto: np ? normalizeLado(np) : emptyLado(),
    })
  }

  if (pares.length && !pares.some((p) => p.es_ganadora)) {
    pares[0].es_ganadora = true
  }
  return pares
}

/**
 * Arma pares iniciales para el modal (mínimo N filas comparativas).
 */
export function seedCotizacionPares({
  existing = [],
  minPares = 0,
  legacy = {},
  proveedorNombre = '',
  costoBase = '',
} = {}) {
  let pares = detalleToPares(existing)

  if (pares.length === 0 && (legacy.cotizacion_numero || legacy.cotizacion_fecha || legacy.cotizacion_vigencia)) {
    const par = newCotizacionPar({ esGanadora: true })
    par.insumo = {
      ...emptyLado(),
      proveedor: proveedorNombre || '',
      valor: costoBase !== '' && costoBase != null ? String(costoBase) : '',
      numero: legacy.cotizacion_numero || nextCotizacionNumero([]),
      fecha: legacy.cotizacion_fecha ? String(legacy.cotizacion_fecha).slice(0, 10) : '',
      vigencia: legacy.cotizacion_vigencia || '',
    }
    par.no_previsto = { ...emptyLado(), proveedor: proveedorNombre || '', numero: par.insumo.numero }
    par.coherencia = { descripcion: '', unidad: '', rendimiento: '' }
    pares = [par]
  }

  while (minPares > 0 && pares.length < Math.max(1, minPares)) {
    pares.push(newCotizacionPar({ esGanadora: pares.length === 0 }))
  }
  return applyAutoGanadoraByMinValor(pares)
}

/** @deprecated Use seedCotizacionPares */
export function seedCotizacionesForm(opts = {}) {
  const pares = seedCotizacionPares({
    existing: opts.existing,
    minPares: opts.minInsumo ?? 3,
    legacy: opts.legacy,
    proveedorNombre: opts.proveedorNombre,
    costoBase: opts.costoBase,
  })
  // Aplana a filas legacy para callers antiguos
  return pares.flatMap((p) => {
    const out = []
    out.push({
      id: `${p.id}-insumo`,
      tipo: 'insumo',
      es_ganadora: !!p.es_ganadora,
      ...normalizeLado(p.insumo),
    })
    out.push({
      id: `${p.id}-np`,
      tipo: 'no_previsto',
      es_ganadora: false,
      ...normalizeLado(p.no_previsto),
    })
    return out
  })
}

export function syncLegacyFromGanadora(cotizacionesOrPares) {
  const list = cotizacionesOrPares || []
  // Pares UI
  if (list.some((r) => r && (r.insumo || r.no_previsto))) {
    const gan = list.find((r) => r.es_ganadora) || list[0]
    const lado = gan?.insumo || emptyLado()
    return {
      cotizacion_numero: (lado.numero || '').trim(),
      cotizacion_fecha: lado.fecha || '',
      cotizacion_vigencia: (lado.vigencia || '').trim(),
    }
  }
  const gan = list.find((r) => r.tipo === 'insumo' && r.es_ganadora)
  if (!gan) {
    return { cotizacion_numero: '', cotizacion_fecha: '', cotizacion_vigencia: '' }
  }
  return {
    cotizacion_numero: (gan.numero || '').trim(),
    cotizacion_fecha: gan.fecha || '',
    cotizacion_vigencia: (gan.vigencia || '').trim(),
  }
}

function ladoPayload(lado) {
  const impuesto = cloneImpuestoLado(lado?.impuesto)
  const hasImp = ['administracion', 'imprevistos', 'utilidad', 'iva'].some(
    (k) => impuesto[k] !== '' && impuesto[k] != null && Number(impuesto[k]) !== 0,
  )
  return {
    proveedor: (lado.proveedor || '').trim() || null,
    valor: lado.valor !== '' && lado.valor != null ? Number(lado.valor) : null,
    numero: (lado.numero || '').trim() || null,
    fecha: lado.fecha || null,
    vigencia: (lado.vigencia || '').trim() || null,
    impuesto_etiqueta: (lado.impuesto_etiqueta || '').trim() || null,
    impuesto: hasImp ? impuesto : null,
    pdf_nombre: (lado.pdf?.name || lado.pdf_nombre || '').trim() || null,
    pdf_historial: Array.isArray(lado.pdf_historial) ? lado.pdf_historial : [],
  }
}

/** Payload JSON plano para guardar (pares → filas insumo + no_previsto con pair_id). */
export function cotizacionesPayloadForSave(cotizacionesOrPares) {
  const list = cotizacionesOrPares || []
  if (list.some((r) => r && (r.insumo || r.no_previsto))) {
    const out = []
    for (const p of list) {
      if (!rowHasData(p)) continue
      const pairId = p.id || uid('pair')
      if (ladoHasData(p.insumo) || p.es_ganadora) {
        out.push({
          id: `${pairId}-insumo`,
          pair_id: pairId,
          tipo: 'insumo',
          es_ganadora: !!p.es_ganadora,
          ...ladoPayload(p.insumo || emptyLado()),
        })
      }
      if (ladoHasData(p.no_previsto)) {
        out.push({
          id: `${pairId}-np`,
          pair_id: pairId,
          tipo: 'no_previsto',
          es_ganadora: false,
          ...ladoPayload(p.no_previsto || emptyLado()),
        })
      }
    }
    return out
  }
  return list
    .filter(rowHasData)
    .map((r) => ({
      id: r.id,
      pair_id: r.pair_id || null,
      tipo: r.tipo === 'no_previsto' ? 'no_previsto' : 'insumo',
      es_ganadora: !!r.es_ganadora && r.tipo !== 'no_previsto',
      ...ladoPayload(r),
    }))
}

export function pickGanadora(cotizacionesOrPares) {
  const list = cotizacionesOrPares || []
  if (list.some((r) => r && (r.insumo || r.no_previsto))) {
    const gan = list.find((r) => r.es_ganadora) || list[0]
    if (!gan) return null
    return {
      id: gan.id,
      tipo: 'insumo',
      es_ganadora: true,
      ...normalizeLado(gan.insumo),
    }
  }
  return list.find((r) => r.tipo === 'insumo' && r.es_ganadora)
    || list.find((r) => r.tipo === 'insumo')
    || null
}

/** Impuesto (form decimal) de la cotización ganadora, si tiene datos. */
export function impuestoGanadoraDesdePares(pares) {
  const gan = pickGanadora(pares)
  if (!gan || !ladoHasImpuesto(gan)) return null
  return cloneImpuestoLado(gan.impuesto)
}

export function otrasCotizaciones(cotizaciones, ganadoraId) {
  const list = cotizaciones || []
  if (list.some((r) => r && (r.insumo || r.no_previsto))) {
    const flat = cotizacionesPayloadForSave(list)
    return flat.filter((r) => {
      if (ganadoraId && (r.pair_id === ganadoraId || r.id === `${ganadoraId}-insumo`)) {
        return r.tipo === 'no_previsto'
      }
      if (r.es_ganadora) return false
      return true
    })
  }
  return list.filter((r) => {
    if (!rowHasData(r)) return false
    if (ganadoraId && r.id === ganadoraId) return false
    if (r.es_ganadora) return false
    return true
  })
}

export function ganadoraDesdeInsumoRow(row) {
  const pares = detalleToPares(row?.cotizaciones_detalle)
  if (pares.length) {
    const gan = pickGanadora(pares)
    if (gan && ladoHasData(gan)) return gan
  }
  const detalle = normalizeCotizacionesDetalle(row?.cotizaciones_detalle)
  const gan = pickGanadora(detalle)
  if (gan && rowHasData(gan)) return gan
  if (row?.cotizacion_numero || row?.cotizacion_fecha || row?.cotizacion_vigencia) {
    return {
      id: 'legacy',
      tipo: 'insumo',
      es_ganadora: true,
      proveedor: row.proveedor_nombre || '',
      valor: row.costo ?? row.costo_base ?? '',
      numero: row.cotizacion_numero || '',
      fecha: row.cotizacion_fecha ? String(row.cotizacion_fecha).slice(0, 10) : '',
      vigencia: row.cotizacion_vigencia || '',
      pdf_nombre: row.soporte_pdf_nombre || '',
    }
  }
  return null
}

export function detalleVisibleDesdeInsumoRow(row) {
  const detalle = normalizeCotizacionesDetalle(row?.cotizaciones_detalle)
  if (detalle.some(rowHasData)) return detalle.filter(rowHasData)
  const gan = ganadoraDesdeInsumoRow(row)
  return gan ? [gan] : []
}

/** Archivos a enviar: { ganadora: File|null, soportes: File[] } */
export function collectPdfFilesFromPares(pares) {
  const list = pares || []
  let ganadora = null
  const soportes = []
  for (const p of list) {
    const insPdf = p?.insumo?.pdf
    const npPdf = p?.no_previsto?.pdf
    if (p.es_ganadora && insPdf && !ganadora) {
      ganadora = insPdf
    } else if (insPdf) {
      soportes.push(insPdf)
    }
    if (npPdf) soportes.push(npPdf)
  }
  return { ganadora, soportes }
}

export function toNumValor(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Consecutivo de nº cotización (COT-001, COT-002, …) según filas ya enviadas. */
export function nextCotizacionNumero(pares) {
  let max = 0
  for (const p of pares || []) {
    for (const lado of [p.insumo, p.no_previsto]) {
      const m = String(lado?.numero || '').trim().match(/(\d+)\s*$/)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
  }
  return `COT-${String(max + 1).padStart(3, '0')}`
}

/** Marca como ganadora la fila con menor valor insumo (empate: primera). */
export function applyAutoGanadoraByMinValor(pares) {
  const list = pares || []
  const ranked = list
    .map((p) => ({ id: p.id, v: toNumValor(p.insumo?.valor) }))
    .filter((x) => x.v != null)
  if (!ranked.length) {
    return list.map((p, i) => ({ ...p, es_ganadora: i === 0 && list.length === 1 }))
  }
  const min = Math.min(...ranked.map((x) => x.v))
  const winId = ranked.find((x) => x.v === min)?.id
  return list.map((p) => ({ ...p, es_ganadora: p.id === winId }))
}

/**
 * Errores de regla: la ganadora no puede superar otras en valor insumo ni No Previsto.
 * También avisa si el mínimo No Previsto cae en otra fila.
 */
export function ganadoraRuleErrors(pares) {
  const list = pares || []
  const errors = []
  const gan = list.find((p) => p.es_ganadora)
  if (!gan) return errors

  const ganIns = toNumValor(gan.insumo?.valor)
  const ganNp = toNumValor(gan.no_previsto?.valor)
  const numLabel = gan.insumo?.numero || gan.id

  for (const p of list) {
    if (p.id === gan.id) continue
    const vi = toNumValor(p.insumo?.valor)
    if (ganIns != null && vi != null && ganIns > vi + 1e-9) {
      errors.push(
        `Cotización ganadora (${numLabel}) tiene valor insumo mayor que ${p.insumo?.numero || p.id} (${vi}). Debe ser la de menor valor.`,
      )
    }
    const vn = toNumValor(p.no_previsto?.valor)
    if (ganNp != null && vn != null && ganNp > vn + 1e-9) {
      errors.push(
        `Cotización ganadora (${numLabel}) tiene valor No Previsto mayor que ${p.insumo?.numero || p.id} (${vn}). Debe ser la de menor valor.`,
      )
    }
  }

  const npRanked = list
    .map((p) => ({ id: p.id, v: toNumValor(p.no_previsto?.valor), num: p.insumo?.numero }))
    .filter((x) => x.v != null)
  if (npRanked.length && ganNp != null) {
    const minNp = Math.min(...npRanked.map((x) => x.v))
    const minNpRow = npRanked.find((x) => x.v === minNp)
    if (minNpRow && minNpRow.id !== gan.id && minNp + 1e-9 < ganNp) {
      errors.push(
        `El menor valor No Previsto está en ${minNpRow.num || minNpRow.id}, no en la ganadora. Ajuste valores o use el mismo proveedor ganador.`,
      )
    }
  }
  return errors
}

export function normCoherencia(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Descripción, unidad y rendimiento idénticos entre filas del mismo insumo. */
export function coherenciaErrors(pares, draft = null) {
  const list = pares || []
  if (!list.length && !draft) return []
  const first = list[0]
  const base = first
    ? {
      descripcion: first.coherencia?.descripcion ?? '',
      unidad: first.coherencia?.unidad ?? '',
      rendimiento: first.coherencia?.rendimiento ?? '',
    }
    : {
      descripcion: draft?.descripcion || '',
      unidad: draft?.unidad || '',
      rendimiento: draft?.rendimiento || '',
    }
  const errors = []
  for (const p of list) {
    const c = p.coherencia || {}
    if (normCoherencia(c.descripcion) !== normCoherencia(base.descripcion)) {
      errors.push(`La descripción de ${p.insumo?.numero || p.id} no coincide con la del grupo.`)
    }
    if (normCoherencia(c.unidad) !== normCoherencia(base.unidad)) {
      errors.push(`La unidad de ${p.insumo?.numero || p.id} no coincide con la del grupo.`)
    }
    if (normCoherencia(String(c.rendimiento ?? '')) !== normCoherencia(String(base.rendimiento ?? ''))) {
      errors.push(`El rendimiento de ${p.insumo?.numero || p.id} no coincide con la del grupo.`)
    }
  }
  if (draft && list.length) {
    if (normCoherencia(draft.descripcion) !== normCoherencia(base.descripcion)) {
      errors.push('La descripción del borrador no coincide con las cotizaciones ya enviadas.')
    }
    if (normCoherencia(draft.unidad) !== normCoherencia(base.unidad)) {
      errors.push('La unidad del borrador no coincide con las cotizaciones ya enviadas.')
    }
    if (normCoherencia(String(draft.rendimiento ?? '')) !== normCoherencia(String(base.rendimiento ?? ''))) {
      errors.push('El rendimiento del borrador no coincide con las cotizaciones ya enviadas.')
    }
  }
  return errors
}

/**
 * ¿Hay algún dato diligenciado en el panel Costos — No Previsto?
 */
export function panelNoPrevistoTouched(form) {
  if (!form) return false
  if (form.valor_no_previsto !== '' && form.valor_no_previsto != null) return true
  if (String(form.cotizacion_numero_np || '').trim()) return true
  if (String(form.cotizacion_fecha_np || '').trim()) return true
  if (String(form.cotizacion_vigencia_np || '').trim()) return true
  const imp = form.impuesto_np
  if (imp && typeof imp === 'object') {
    const keys = ['a', 'i', 'u', 'iva']
    if (keys.some((k) => imp[k] !== '' && imp[k] != null && Number(imp[k]) !== 0)) return true
  }
  return false
}

/**
 * ¿Hay algún dato diligenciado en el panel Costos — Insumo?
 */
export function panelInsumoTouched(form) {
  if (!form) return false
  if (form.costo_base !== '' && form.costo_base != null) return true
  if (String(form.cotizacion_numero || '').trim()) return true
  if (String(form.cotizacion_fecha || '').trim()) return true
  if (String(form.cotizacion_vigencia || '').trim()) return true
  if (form.cantidad_negociada !== '' && form.cantidad_negociada != null) return true
  const imp = form.impuesto
  if (imp && typeof imp === 'object') {
    const keys = ['a', 'i', 'u', 'iva']
    if (keys.some((k) => imp[k] !== '' && imp[k] != null && Number(imp[k]) !== 0)) return true
  }
  return false
}

export function toUpperTrim(s) {
  return String(s || '').trim().toUpperCase()
}

/** Solo dígitos y un separador decimal (punto o coma). */
export function sanitizeRendimientoInput(raw) {
  let s = String(raw ?? '').replace(/[^\d.,]/g, '')
  s = s.replace(/,/g, '.')
  const first = s.indexOf('.')
  if (first !== -1) {
    s = s.slice(0, first + 1) + s.slice(first + 1).replace(/\./g, '')
  }
  return s
}

/**
 * Construye un par desde el formulario de captura y lo agrega a la lista.
 * El nº de cotización es manual; mayúsculas en números y descripción.
 * @param {object} [opts]
 * @param {string} [opts.impuestoEtiqueta]
 * @param {string} [opts.impuestoEtiquetaNp]
 * @param {object} [opts.impuesto]
 * @param {object} [opts.impuestoNp]
 */
export function buildParFromCapture(form, paresExistentes = [], opts = {}) {
  const numeroIns = toUpperTrim(form.cotizacion_numero)
  const numeroNp = toUpperTrim(form.cotizacion_numero_np)
  const proveedorNombre = (form.razon_social || '').trim()
  const valorIns = form.costo_base
  const valorNp = form.valor_no_previsto !== '' && form.valor_no_previsto != null
    ? form.valor_no_previsto
    : ''
  const fecha = form.cotizacion_fecha || ''
  const vigencia = form.cotizacion_vigencia || ''
  const fechaNp = form.cotizacion_fecha_np || ''
  const vigenciaNp = form.cotizacion_vigencia_np || ''
  const impuestoEtiqueta = (opts.impuestoEtiqueta || form.impuesto_etiqueta || '').trim()
  const impuestoEtiquetaNp = (
    opts.impuestoEtiquetaNp
    || form.impuesto_etiqueta_np
    || ''
  ).trim()
  const impuestoIns = cloneImpuestoLado(opts.impuesto || form.impuesto)
  const impuestoNp = cloneImpuestoLado(opts.impuestoNp || form.impuesto_np)
  const par = {
    ...newCotizacionPar({ esGanadora: false }),
    proveedor_id: form.proveedor_id || '',
    nit: (form.nit || '').trim(),
    contacto_email: (form.contacto_email || '').trim(),
    contacto_nombre: (form.contacto_nombre || '').trim(),
    contacto_telefono: (form.contacto_telefono || '').trim(),
    coherencia: {
      descripcion: toUpperTrim(form.descripcion),
      unidad: (form.unidad || '').trim(),
      rendimiento: sanitizeRendimientoInput(form.rendimiento ?? ''),
    },
    insumo: {
      ...emptyLado(),
      proveedor: proveedorNombre,
      valor: valorIns !== '' && valorIns != null ? String(valorIns) : '',
      numero: numeroIns,
      fecha,
      vigencia,
      impuesto_etiqueta: impuestoEtiqueta,
      impuesto: impuestoIns,
    },
    no_previsto: {
      ...emptyLado(),
      proveedor: proveedorNombre,
      valor: valorNp !== '' && valorNp != null ? String(valorNp) : '',
      numero: numeroNp,
      fecha: fechaNp,
      vigencia: vigenciaNp,
      impuesto_etiqueta: impuestoEtiquetaNp,
      impuesto: impuestoNp,
    },
  }
  // Si el panel NP no se usó, dejar el lado vacío (sin número ni proveedor fantasma)
  if (!panelNoPrevistoTouched(form)) {
    par.no_previsto = emptyLado()
  }
  return applyAutoGanadoraByMinValor([...(paresExistentes || []), par])
}

/**
 * Aplica los campos de captura sobre un par existente (Actualizar tabla).
 */
export function applyCaptureToPar(par, form, opts = {}) {
  const numeroIns = toUpperTrim(form.cotizacion_numero)
  const numeroNp = toUpperTrim(form.cotizacion_numero_np)
  const valorIns = form.costo_base
  const valorNp = form.valor_no_previsto !== '' && form.valor_no_previsto != null
    ? form.valor_no_previsto
    : ''
  const impuestoEtiqueta = (opts.impuestoEtiqueta || form.impuesto_etiqueta || '').trim()
  const impuestoEtiquetaNp = (opts.impuestoEtiquetaNp || form.impuesto_etiqueta_np || '').trim()
  const impuestoIns = cloneImpuestoLado(opts.impuesto || form.impuesto)
  const impuestoNpForm = cloneImpuestoLado(opts.impuestoNp || form.impuesto_np)
  const proveedorNombre = (form.razon_social || '').trim() || par.insumo?.proveedor || ''
  const next = {
    ...par,
    proveedor_id: form.proveedor_id || par.proveedor_id || '',
    nit: (form.nit || '').trim(),
    contacto_email: (form.contacto_email || '').trim(),
    contacto_nombre: (form.contacto_nombre || '').trim(),
    contacto_telefono: (form.contacto_telefono || '').trim(),
    coherencia: {
      ...(par.coherencia || {}),
      descripcion: toUpperTrim(form.descripcion || par.coherencia?.descripcion),
      unidad: (form.unidad || par.coherencia?.unidad || '').trim(),
      rendimiento: sanitizeRendimientoInput(
        form.rendimiento !== undefined && form.rendimiento !== null
          ? form.rendimiento
          : (par.coherencia?.rendimiento ?? ''),
      ),
    },
    insumo: {
      ...(par.insumo || emptyLado()),
      proveedor: proveedorNombre,
      valor: valorIns !== '' && valorIns != null ? String(valorIns) : '',
      numero: numeroIns || par.insumo?.numero || '',
      fecha: form.cotizacion_fecha || '',
      vigencia: form.cotizacion_vigencia || '',
      impuesto_etiqueta: impuestoEtiqueta,
      impuesto: impuestoIns,
    },
    no_previsto: panelNoPrevistoTouched(form)
      ? {
        ...(par.no_previsto || emptyLado()),
        proveedor: proveedorNombre,
        valor: valorNp !== '' && valorNp != null ? String(valorNp) : '',
        numero: numeroNp || par.no_previsto?.numero || '',
        fecha: form.cotizacion_fecha_np || '',
        vigencia: form.cotizacion_vigencia_np || '',
        impuesto_etiqueta: impuestoEtiquetaNp,
        impuesto: impuestoNpForm,
      }
      : {
        ...emptyLado(),
        proveedor: proveedorNombre,
        pdf: par.no_previsto?.pdf || null,
        pdf_nombre: par.no_previsto?.pdf_nombre || '',
        pdf_historial: par.no_previsto?.pdf_historial || [],
      },
  }
  return next
}

/**
 * Reemplaza el PDF de un lado: archiva el nombre previo y deja vigente el nuevo.
 */
export function applyPdfReplace(lado, file) {
  const prev = { ...(lado || emptyLado()) }
  const prevName = (prev.pdf?.name || prev.pdf_nombre || '').trim()
  const historial = Array.isArray(prev.pdf_historial) ? [...prev.pdf_historial] : []
  if (prevName && file && prevName !== file.name) {
    historial.push({ nombre: prevName, replaced_at: new Date().toISOString() })
  } else if (prevName && !file) {
    historial.push({ nombre: prevName, replaced_at: new Date().toISOString() })
  }
  return {
    ...prev,
    pdf: file || null,
    pdf_nombre: file?.name || '',
    pdf_historial: historial.slice(-20),
  }
}

/** Extrae el primer archivo válido de un DataTransfer (drag & drop). */
export function fileFromDataTransfer(dt) {
  if (!dt) return null
  const files = dt.files
  if (files && files.length > 0) return files[0]
  const items = dt.items
  if (items && items.length) {
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].kind === 'file') {
        const f = items[i].getAsFile()
        if (f) return f
      }
    }
  }
  return null
}

export function validateCaptureForEnviar(form, paresExistentes = []) {
  const faltantes = []
  if (!(form.razon_social || '').trim() && !form.proveedor_id) faltantes.push('Proveedor (razón social)')
  if (!form.proveedor_id && !(form.nit || '').trim()) faltantes.push('NIT del proveedor')
  if (!(form.descripcion || '').trim()) faltantes.push('Descripción del insumo')
  if (!(form.unidad || '').trim()) faltantes.push('Unidad')

  const rend = sanitizeRendimientoInput(form.rendimiento ?? '')
  if (String(form.rendimiento ?? '').trim() && rend === '') {
    faltantes.push('Rendimiento (solo numérico)')
  } else if (rend !== '' && Number.isNaN(Number(rend))) {
    faltantes.push('Rendimiento (solo numérico)')
  }

  const insumoTouched = panelInsumoTouched(form)
  const npTouched = panelNoPrevistoTouched(form)

  if (!insumoTouched && !npTouched) {
    faltantes.push('Diligencie al menos el panel Costos — Insumo')
  }

  if (insumoTouched) {
    if (form.costo_base === '' || form.costo_base == null || Number(form.costo_base) < 0) {
      faltantes.push('Valor (Insumo)')
    }
    if (!(form.cotizacion_numero || '').trim()) faltantes.push('Nº de cotización (Insumo)')
  }

  if (npTouched) {
    if (!(form.cotizacion_numero_np || '').trim()) faltantes.push('Nº de cotización (No Previsto)')
  }

  const coh = coherenciaErrors(paresExistentes, form)
  return { faltantes, coherencia: coh }
}

export function validateGuardarInsumo(form, { editId = null } = {}) {
  const faltantes = []
  const pares = form.cotizaciones_detalle || []
  if (!(form.descripcion || '').trim()) faltantes.push('Descripción del insumo')
  if (!(form.unidad || '').trim()) faltantes.push('Unidad')

  const gan = pickGanadora(pares)
  const costo = gan?.valor != null && gan.valor !== ''
    ? gan.valor
    : form.costo_base
  if (costo === '' || costo == null || Number(costo) < 0) {
    faltantes.push('Costo base (valor de la cotización ganadora)')
  }

  if (form.requiere_cotizacion !== false) {
    const hasGan = gan && (
      (gan.numero || '').trim()
      || (gan.valor !== '' && gan.valor != null)
      || gan.pdf
      || (gan.pdf_nombre || '').trim()
    )
    if (!hasGan) {
      faltantes.push('Cotización ganadora (menor valor) con datos')
    }

    for (const p of pares) {
      const numLabel = p.insumo?.numero || p.no_previsto?.numero || p.id
      if (ladoHasCaptureData(p.insumo) && !ladoHasPdf(p.insumo)) {
        faltantes.push(`PDF de soporte de la cotización ${numLabel} (lado Insumo)`)
      }
      if (ladoHasCaptureData(p.no_previsto) && !ladoHasPdf(p.no_previsto)) {
        faltantes.push(`PDF de soporte de la cotización ${numLabel} (lado No Previsto)`)
      }
    }
  }

  faltantes.push(...coherenciaErrors(pares))
  const ruleErrs = ganadoraRuleErrors(pares)
  return { faltantes, ruleErrors: ruleErrs }
}
