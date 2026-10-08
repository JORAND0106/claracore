/**
 * Helpers puros — redistribución de cantidades compartidas entre subcontratistas.
 * Incluye decisiones Mantener / Saldar sobre subcontratistas existentes.
 */

export const DECISION_MANTENER = 'mantener'
export const DECISION_SALDAR = 'saldar'

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
  const r2 = Math.round(raw * 100) / 100
  if (r2 >= 0.1) return r2
  return Math.round(raw * 1000) / 1000
}

/**
 * Participantes (nuevo + mantenidos) y saldados a partir de decisiones.
 * @returns {{ participantes: number[], saldados: number[] }}
 */
export function participantesDesdeDecisiones(existentesIds, nuevoId, decisiones = {}) {
  const nuevo = Number(nuevoId)
  const saldados = []
  const mantenidos = []
  for (const raw of existentesIds || []) {
    const sid = Number(raw)
    if (!Number.isFinite(sid) || sid <= 0 || sid === nuevo) continue
    const d = String(decisiones[sid] ?? decisiones[String(sid)] ?? DECISION_MANTENER).toLowerCase()
    if (d === DECISION_SALDAR) saldados.push(sid)
    else mantenidos.push(sid)
  }
  const participantes = [...new Set([...mantenidos, ...(Number.isFinite(nuevo) && nuevo > 0 ? [nuevo] : [])])]
    .sort((a, b) => a - b)
  return { participantes, saldados: saldados.sort((a, b) => a - b) }
}

/**
 * Cantidades finales por sub según decisiones.
 * Saldados → ejecutado; participantes → ejecutado + prop × saldo.
 */
export function cantidadesTrasDecisiones(fila, props, decisiones, nuevoId) {
  const exist = fila?.subs_existentes || []
  const { participantes, saldados } = participantesDesdeDecisiones(exist, nuevoId, decisiones)
  const saldo = Number(fila?.saldo) || 0
  const out = {}
  for (const sid of saldados) {
    const info = fila?.ejecutados?.[sid] || fila?.ejecutados?.[String(sid)] || {}
    out[sid] = Number(info.ejecutado) || 0
  }
  for (const sid of participantes) {
    const info = fila?.ejecutados?.[sid] || fila?.ejecutados?.[String(sid)] || {}
    const ejec = Number(info.ejecutado) || 0
    const prop = Number(props[sid] ?? props[String(sid)]) || 0
    out[sid] = cantidadTrasRedistribucion(ejec, prop, saldo)
  }
  return { cantidades: out, participantes, saldados }
}

/** Ítems donde al saldar se liberan cantidades no reconocidas como ejecutadas. */
export function liberacionesAlSaldar(filas = [], decisiones = {}) {
  const out = []
  for (const f of filas || []) {
    for (const sid of f.subs_existentes || []) {
      const d = String(decisiones[sid] ?? decisiones[String(sid)] ?? '').toLowerCase()
      if (d !== DECISION_SALDAR) continue
      const info = f.ejecutados?.[sid] || f.ejecutados?.[String(sid)] || {}
      const noRec = Number(info.cantidad_no_reconocida) || 0
      if (noRec > 0) {
        out.push({
          presupuesto_id: f.presupuesto_id,
          item: f.item,
          tramo: f.tramo,
          subcontratista_id: sid,
          label: info.label || `#${sid}`,
          cantidad_no_reconocida: noRec,
        })
      }
    }
  }
  return out
}
