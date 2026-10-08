/**
 * Helpers puros — redistribución de cantidades compartidas entre subcontratistas.
 */

export function proporcionesIguales(participanteIds = []) {
  const ids = [...new Set((participanteIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    .sort((a, b) => a - b)
  if (!ids.length) return {}
  const n = ids.length
  const base = Math.round((1 / n) * 1e6) / 1e6
  const out = {}
  ids.forEach((id, i) => {
    out[id] = i < n - 1 ? base : Math.round((1 - base * (n - 1)) * 1e6) / 1e6
  })
  return out
}

export function sumProporciones(props = {}) {
  let s = 0
  for (const v of Object.values(props)) {
    const n = Number(v)
    if (Number.isFinite(n)) s += n
  }
  return Math.round(s * 1e6) / 1e6
}

/** @returns {string|null} mensaje de error o null si OK */
export function validarProporciones(props, participanteIds = []) {
  const ids = [...new Set((participanteIds || []).map(Number).filter((n) => n > 0))]
  if (!ids.length) return 'No hay subcontratistas participantes.'
  for (const id of ids) {
    const raw = props[id] ?? props[String(id)]
    if (raw === '' || raw == null) return `Falta la proporción del subcontratista #${id}.`
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      return `La proporción del subcontratista #${id} debe ser un decimal entre 0 y 1.`
    }
  }
  const s = sumProporciones(
    Object.fromEntries(ids.map((id) => [id, Number(props[id] ?? props[String(id)])])),
  )
  if (Math.abs(s - 1) > 1e-6) {
    return `Las proporciones deben sumar exactamente 1.00 (actual: ${s.toFixed(4)}).`
  }
  return null
}

export function fmtCantPpto(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('es-CO', { maximumFractionDigits: 4 })
}

/** Cantidad resultante = ejecutado + proporción × saldo */
export function cantidadTrasRedistribucion(ejecutado, proporcion, saldo) {
  const e = Number(ejecutado) || 0
  const p = Number(proporcion) || 0
  const s = Number(saldo) || 0
  const raw = e + p * s
  // Misma regla visual aproximada que la plataforma (2 dp si ≥0.10)
  const r2 = Math.round(raw * 100) / 100
  if (r2 >= 0.1) return r2
  return Math.round(raw * 1000) / 1000
}
