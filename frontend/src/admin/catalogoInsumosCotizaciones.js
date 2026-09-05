/**
 * Cotizaciones del catálogo: pares Insumo | No Previsto en la misma fila (comparación).
 */

function uid(prefix = 'p') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function emptyLado() {
  return {
    proveedor: '',
    valor: '',
    numero: '',
    fecha: '',
    vigencia: '',
    pdf: null,
    pdf_nombre: '',
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
    || lado.pdf
    || (lado.pdf_nombre || '').trim()
  )
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
  return {
    proveedor: item?.proveedor != null ? String(item.proveedor) : '',
    valor: item?.valor != null && item.valor !== '' ? String(item.valor) : '',
    numero: item?.numero != null ? String(item.numero) : '',
    fecha: item?.fecha ? String(item.fecha).slice(0, 10) : '',
    vigencia: item?.vigencia != null ? String(item.vigencia) : '',
    pdf: item?.pdf || null,
    pdf_nombre: item?.pdf_nombre != null ? String(item.pdf_nombre) : '',
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
  minPares = 3,
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
      numero: legacy.cotizacion_numero || '',
      fecha: legacy.cotizacion_fecha ? String(legacy.cotizacion_fecha).slice(0, 10) : '',
      vigencia: legacy.cotizacion_vigencia || '',
    }
    pares = [par]
  }

  while (pares.length < Math.max(1, minPares)) {
    pares.push(newCotizacionPar({ esGanadora: pares.length === 0 }))
  }
  if (!pares.some((p) => p.es_ganadora)) {
    pares = [{ ...pares[0], es_ganadora: true }, ...pares.slice(1)]
  }
  return pares
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
  return {
    proveedor: (lado.proveedor || '').trim() || null,
    valor: lado.valor !== '' && lado.valor != null ? Number(lado.valor) : null,
    numero: (lado.numero || '').trim() || null,
    fecha: lado.fecha || null,
    vigencia: (lado.vigencia || '').trim() || null,
    pdf_nombre: (lado.pdf?.name || lado.pdf_nombre || '').trim() || null,
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
