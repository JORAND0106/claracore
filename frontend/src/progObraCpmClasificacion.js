import { addCalendarDays, countDiasHabilesEnRango, isoFromDate, parseIsoDate } from './progObraFormat'

function asBool(v) {
  if (v === true || v === 1 || v === '1' || v === 'true' || v === 't') return true
  if (v === false || v === 0 || v === '0' || v === 'false' || v === 'f') return false
  return Boolean(v)
}

/** Normaliza filas CPM del API (booleanos y holgura numérica). */
export function normalizeCpmRow(r) {
  if (!r) return null
  return {
    ...r,
    holgura_total: Number(r.holgura_total),
    holgura_libre: Number(r.holgura_libre),
    es_ruta_critica: asBool(r.es_ruta_critica),
    es_actividad_final_tramo: asBool(r.es_actividad_final_tramo),
    tiene_sucesores: asBool(r.tiene_sucesores),
  }
}

export function pickBestCpmNodeTramo(nodes) {
  if (!nodes?.length) return null
  const normalized = nodes.map((raw) => normalizeCpmRow(raw)).filter(Boolean)
  if (!normalized.length) return null
  const withDates = normalized.filter((n) => n.fecha_inicio_temprana)
  const pool = withDates.length ? withDates : normalized
  return pool.reduce((best, n) => {
    if (!best) return n
    const bh = Number(best.holgura_total)
    const nh = Number(n.holgura_total)
    if (Number.isFinite(nh) && Number.isFinite(bh)) {
      if (nh < bh) return n
      if (nh > bh) return best
    } else if (Number.isFinite(nh) && nh < 0) return n
    else if (Number.isFinite(bh) && bh < 0) return best
    const bf = String(best.fecha_fin_temprana || '')
    const nf = String(n.fecha_fin_temprana || '')
    if (nf > bf) return n
    if (nf < bf) return best
    return pickBestCpmNode([best, n])
  }, null)
}

/** Días hábiles que la actividad excede la fecha fin del cronograma (0 = dentro de plazo). */
export function diasDesfaseHorizonte(cpmNode, versionFinIso, noHabilesSet = new Set()) {
  if (!cpmNode?.fecha_fin_temprana || !versionFinIso) return 0
  const holgura = Number(cpmNode.holgura_total)
  if (Number.isFinite(holgura) && holgura < 0) return Math.abs(holgura)
  const fin = String(cpmNode.fecha_fin_temprana).slice(0, 10)
  const lim = String(versionFinIso).slice(0, 10)
  if (fin <= lim) return 0
  const limD = parseIsoDate(lim)
  if (!limD) return 0
  const diaSiguiente = addCalendarDays(limD, 1)
  return countDiasHabilesEnRango(isoFromDate(diaSiguiente), fin, noHabilesSet)
}

/**
 * Agrupadores (consolidado tramo) o filas PK cuyo fin CPM supera el horizonte de la versión.
 */
export function collectDesfaseHorizonte(cpmRows, versionFinIso, { labelByAgId, tramoConsolidado, noHabilesSet } = {}) {
  if (!versionFinIso || !cpmRows?.length) return []
  const byKey = new Map()
  for (const raw of cpmRows) {
    const n = normalizeCpmRow(raw)
    if (!n?.fecha_fin_temprana || n.agrupador_id == null || n.agrupador_id === '') continue
    const dias = diasDesfaseHorizonte(n, versionFinIso, noHabilesSet || new Set())
    if (dias <= 0) continue
    const agKey = String(n.agrupador_id)
    const agLabel = labelByAgId?.[agKey] || agKey
    const mapKey = tramoConsolidado ? agKey : `${String(n.pk_id || '').trim()}\u0000${agKey}`
    const label = tramoConsolidado ? agLabel : `${String(n.pk_id || '').trim()} · ${agLabel}`
    const cur = byKey.get(mapKey)
    if (!cur || dias > cur.dias) {
      byKey.set(mapKey, {
        key: mapKey,
        label,
        dias,
        fechaFin: String(n.fecha_fin_temprana).slice(0, 10),
        holgura: n.holgura_total,
      })
    }
  }
  return [...byKey.values()].sort((a, b) => b.dias - a.dias)
}

export function pickBestCpmNode(nodes) {
  if (!nodes?.length) return null
  return nodes.reduce((best, raw) => {
    const n = normalizeCpmRow(raw)
    if (!best) return n
    const bCrit = best.es_ruta_critica || (Number.isFinite(best.holgura_total) && best.holgura_total <= 0)
    const nCrit = n.es_ruta_critica || (Number.isFinite(n.holgura_total) && n.holgura_total <= 0)
    if (nCrit && !bCrit) return n
    if (bCrit && !nCrit) return best
    return (Number(n.holgura_total) ?? 999) < (Number(best.holgura_total) ?? 999) ? n : best
  }, null)
}

/**
 * Clasificación CPM: ruta crítica real vs actividad final del tramo.
 */
export function clasificarNodoCpm(r, versionFinIso = null, noHabilesSet = null) {
  if (!r) {
    return { tipo: 'normal', label: null, holguraCero: false, bgCritico: false, bgFinal: false, holguraNegativa: false }
  }
  const row = normalizeCpmRow(r)
  const holgura = Number(row.holgura_total)
  let holguraNegativa = Number.isFinite(holgura) && holgura < 0
  if (!holguraNegativa && versionFinIso) {
    holguraNegativa = diasDesfaseHorizonte(row, versionFinIso, noHabilesSet || new Set()) > 0
  }

  if (holguraNegativa) {
    return {
      tipo: 'holgura_negativa',
      label: '⚠ Fuera de plazo',
      holguraCero: false,
      bgCritico: false,
      bgFinal: false,
      holguraNegativa: true,
      bgAlerta: true,
    }
  }

  const holguraCero = Number.isFinite(holgura) && holgura <= 0

  if (row.es_actividad_final_tramo || (holguraCero && row.tiene_sucesores === false)) {
    return {
      tipo: 'final_tramo',
      label: '🏁 Actividad final del tramo',
      holguraCero: true,
      bgCritico: false,
      bgFinal: true,
    }
  }
  if (row.es_ruta_critica || (holguraCero && row.tiene_sucesores !== false)) {
    return {
      tipo: 'critica',
      label: '⚠ Ruta crítica',
      holguraCero: true,
      bgCritico: true,
      bgFinal: false,
    }
  }
  if (holguraCero) {
    return {
      tipo: 'final_tramo',
      label: '🏁 Actividad final del tramo',
      holguraCero: true,
      bgCritico: false,
      bgFinal: true,
    }
  }
  return {
    tipo: 'holgura',
    label: `🟡 Con holgura`,
    holguraCero: false,
    bgCritico: false,
    bgFinal: false,
  }
}

export function cpmTooltipClasificacion(clasif, holguraDias) {
  if (!clasif) return null
  if (clasif.tipo === 'critica') {
    return '⚠ Ruta crítica — cuello de botella (holgura 0, bloquea actividades posteriores)'
  }
  if (clasif.tipo === 'holgura_negativa') {
    return '⚠ Fuera de plazo — la actividad excede la fecha fin del cronograma (holgura negativa)'
  }
  if (clasif.tipo === 'final_tramo') {
    return '🏁 Actividad final del tramo — define la fecha de entrega (holgura 0, sin sucesores)'
  }
  if (holguraDias > 0) {
    return `Holgura: ${holguraDias} día${holguraDias !== 1 ? 's' : ''} hábiles`
  }
  return null
}
