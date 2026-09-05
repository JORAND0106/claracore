/**
 * Cotizaciones del catálogo de insumos (hoja de cálculo: insumo + No Previstos).
 */

export function newCotizacionRow(tipo = 'insumo', { esGanadora = false } = {}) {
  return {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tipo: tipo === 'no_previsto' ? 'no_previsto' : 'insumo',
    es_ganadora: !!esGanadora && tipo !== 'no_previsto',
    proveedor: '',
    valor: '',
    numero: '',
    fecha: '',
    vigencia: '',
  }
}

function rowHasData(r) {
  if (!r) return false
  return !!(
    r.es_ganadora
    || (r.proveedor || '').trim()
    || (r.numero || '').trim()
    || (r.fecha || '').trim()
    || (r.vigencia || '').trim()
    || (r.valor !== '' && r.valor != null)
  )
}

/** Normaliza lista cruda (API o legado) a filas de UI. */
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
      tipo,
      es_ganadora: !!item?.es_ganadora && tipo === 'insumo',
      proveedor: item?.proveedor != null ? String(item.proveedor) : '',
      valor: item?.valor != null && item.valor !== '' ? String(item.valor) : '',
      numero: item?.numero != null ? String(item.numero) : '',
      fecha: item?.fecha ? String(item.fecha).slice(0, 10) : '',
      vigencia: item?.vigencia != null ? String(item.vigencia) : '',
    }
  })
}

/**
 * Arma filas iniciales para el modal: mínimo N de insumo + M de no previstos,
 * rellenando con datos existentes / campos legados de cotización ganadora.
 */
export function seedCotizacionesForm({
  existing = [],
  minInsumo = 3,
  minNoPrevisto = 2,
  legacy = {},
  proveedorNombre = '',
  costoBase = '',
} = {}) {
  const normalized = normalizeCotizacionesDetalle(existing)
  let insumo = normalized.filter((r) => r.tipo === 'insumo')
  let noPrev = normalized.filter((r) => r.tipo === 'no_previsto')

  if (insumo.length === 0 && (legacy.cotizacion_numero || legacy.cotizacion_fecha || legacy.cotizacion_vigencia)) {
    insumo = [{
      ...newCotizacionRow('insumo', { esGanadora: true }),
      proveedor: proveedorNombre || '',
      valor: costoBase !== '' && costoBase != null ? String(costoBase) : '',
      numero: legacy.cotizacion_numero || '',
      fecha: legacy.cotizacion_fecha ? String(legacy.cotizacion_fecha).slice(0, 10) : '',
      vigencia: legacy.cotizacion_vigencia || '',
    }]
  }

  if (!insumo.some((r) => r.es_ganadora) && insumo.length > 0) {
    insumo = insumo.map((r, i) => ({ ...r, es_ganadora: i === 0 }))
  }

  while (insumo.length < Math.max(1, minInsumo)) {
    insumo.push(newCotizacionRow('insumo', { esGanadora: insumo.length === 0 }))
  }
  if (!insumo.some((r) => r.es_ganadora)) {
    insumo = [{ ...insumo[0], es_ganadora: true }, ...insumo.slice(1)]
  }

  while (noPrev.length < Math.max(1, minNoPrevisto)) {
    noPrev.push(newCotizacionRow('no_previsto'))
  }

  return [...insumo, ...noPrev]
}

/** Sync campos legados de ganadora desde la hoja de cotizaciones. */
export function syncLegacyFromGanadora(cotizaciones) {
  const gan = (cotizaciones || []).find((r) => r.tipo === 'insumo' && r.es_ganadora)
  if (!gan) {
    return { cotizacion_numero: '', cotizacion_fecha: '', cotizacion_vigencia: '' }
  }
  return {
    cotizacion_numero: (gan.numero || '').trim(),
    cotizacion_fecha: gan.fecha || '',
    cotizacion_vigencia: (gan.vigencia || '').trim(),
  }
}

/** Payload JSON para guardar (omite filas vacías). */
export function cotizacionesPayloadForSave(cotizaciones) {
  return (cotizaciones || [])
    .filter(rowHasData)
    .map((r) => ({
      id: r.id,
      tipo: r.tipo === 'no_previsto' ? 'no_previsto' : 'insumo',
      es_ganadora: !!r.es_ganadora && r.tipo !== 'no_previsto',
      proveedor: (r.proveedor || '').trim() || null,
      valor: r.valor !== '' && r.valor != null ? Number(r.valor) : null,
      numero: (r.numero || '').trim() || null,
      fecha: r.fecha || null,
      vigencia: (r.vigencia || '').trim() || null,
    }))
}

export function pickGanadora(cotizaciones) {
  return (cotizaciones || []).find((r) => r.tipo === 'insumo' && r.es_ganadora)
    || (cotizaciones || []).find((r) => r.tipo === 'insumo')
    || null
}

export function otrasCotizaciones(cotizaciones, ganadoraId) {
  return (cotizaciones || []).filter((r) => {
    if (!rowHasData(r)) return false
    if (ganadoraId && r.id === ganadoraId) return false
    if (r.es_ganadora) return false
    return true
  })
}

export function ganadoraDesdeInsumoRow(row) {
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
