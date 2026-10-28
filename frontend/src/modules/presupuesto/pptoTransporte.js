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
 * @param {{ capitulo?: unknown, competencia?: unknown, itemsOrigen?: unknown[], itemDestino?: unknown }} sel
 */
export function claveReporteTransporte(sel) {
  const cap = String(sel?.capitulo ?? '').trim()
  const comp = String(sel?.competencia ?? '').trim()
  const dest = String(sel?.itemDestino ?? '').trim()
  const origen = [...new Set((sel?.itemsOrigen || []).map((x) => String(x ?? '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  return `${cap}\x1e${comp}\x1e${origen.join(',')}\x1e${dest}`
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
