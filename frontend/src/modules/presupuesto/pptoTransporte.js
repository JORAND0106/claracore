/**
 * Helpers puros — reporte de transporte (Obra Ejecutada).
 * Reparte una cantidad suelta entre PK_ID según su cantidad compacta.
 */

/**
 * @param {Array<{ pk_id: string, cant_compacta: number }>} filas
 * @param {number} cantidadReportar
 * @returns {{ ok: boolean, error?: string, totalCompacta: number, filas: Array<{
 *   pk_id: string, cant_compacta: number, peso: number, cant_transporte: number
 * }>, totalAsignado: number }}
 */
export function repartirTransportePorPk(filas, cantidadReportar) {
  const list = (Array.isArray(filas) ? filas : [])
    .map((f) => ({
      pk_id: String(f?.pk_id ?? '').trim(),
      cant_compacta: Number(f?.cant_compacta) || 0,
    }))
    .filter((f) => f.pk_id && f.cant_compacta > 0)

  const totalCompacta = list.reduce((s, f) => s + f.cant_compacta, 0)
  const qty = Math.round((Number(cantidadReportar) || 0) * 100) / 100

  if (!(totalCompacta > 0)) {
    return {
      ok: false,
      error: 'La cantidad compacta de la selección es cero; no se puede repartir.',
      totalCompacta: 0,
      filas: [],
      totalAsignado: 0,
    }
  }
  if (!(qty > 0)) {
    return {
      ok: false,
      error: 'Indique una cantidad a reportar mayor que cero.',
      totalCompacta,
      filas: [],
      totalAsignado: 0,
    }
  }

  /** @type {Array<{ pk_id: string, cant_compacta: number, peso: number, cant_transporte: number }>} */
  const out = list.map((f) => {
    const peso = f.cant_compacta / totalCompacta
    const cant_transporte = Math.round(qty * peso * 100) / 100
    return { ...f, peso, cant_transporte }
  })

  let sum = out.reduce((s, f) => s + f.cant_transporte, 0)
  sum = Math.round(sum * 100) / 100
  let diff = Math.round((qty - sum) * 100) / 100
  if (diff !== 0 && out.length) {
    // Ajuste de redondeo en el PK de mayor peso (mayor compacta; empate → primero).
    let idxMax = 0
    for (let i = 1; i < out.length; i += 1) {
      if (out[i].cant_compacta > out[idxMax].cant_compacta) idxMax = i
    }
    out[idxMax].cant_transporte = Math.round((out[idxMax].cant_transporte + diff) * 100) / 100
  }

  const totalAsignado = Math.round(out.reduce((s, f) => s + f.cant_transporte, 0) * 100) / 100
  return { ok: true, totalCompacta, filas: out, totalAsignado }
}

/**
 * Clave estable para detectar reportes repetidos.
 * Origen: capítulo + competencia + ítems. Destino: capítulo + competencia + ítem.
 * @param {{
 *   capitulo?: unknown,
 *   capituloOrigen?: unknown,
 *   competenciaOrigen?: unknown,
 *   itemsOrigen?: unknown[],
 *   capituloDestino?: unknown,
 *   competenciaDestino?: unknown,
 *   competencia?: unknown,
 *   itemDestino?: unknown,
 * }} sel
 */
export function claveReporteTransporte(sel) {
  const capO = String(sel?.capituloOrigen ?? sel?.capitulo ?? '').trim()
  const compO = String(sel?.competenciaOrigen ?? '').trim()
  const capD = String(sel?.capituloDestino ?? capO).trim()
  const compD = String(sel?.competenciaDestino ?? sel?.competencia ?? '').trim()
  const dest = String(sel?.itemDestino ?? '').trim()
  const origen = [...new Set((sel?.itemsOrigen || []).map((x) => String(x ?? '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  return `${capO}\x1e${compO}\x1e${origen.join(',')}\x1e${capD}\x1e${compD}\x1e${dest}`
}

/** Etiqueta de fuente de cantidad OE. */
export function etiquetaOrigenCantidad(origen) {
  const o = String(origen || '').trim().toLowerCase()
  if (o === 'sicoe_obra') return 'SicoeObra'
  if (o === 'presupuesto') return 'Presupuesto'
  return String(origen || '').trim() || 'Presupuesto'
}

export function fmtCantTransporte(v, maxFrac = 2) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: maxFrac })
}

export function fmtPesoPct(peso) {
  const n = Number(peso)
  if (!Number.isFinite(n)) return '—'
  return `${(n * 100).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
}
