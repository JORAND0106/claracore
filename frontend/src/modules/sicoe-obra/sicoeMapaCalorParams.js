import { sicoeAppendFSicoeToSearchParams } from './sicoeFiltroCatalogo.js'

/** Serializa capas de validación (misma forma que la grilla SicoeObra). */
export function sicoeSerializarCapasMapa(capas) {
  if (!Array.isArray(capas)) return []
  return capas.map((c) => {
    const est = String(c?.estado || '').trim()
    if (!est) return null
    if (c?.nivel != null && c.nivel !== '') {
      const n = parseInt(c.nivel, 10)
      if (Number.isFinite(n) && n >= 1 && n <= 6) return { nivel: n, estado: est }
    }
    if (c?.cargo_id != null && c.cargo_id !== '') {
      const id = parseInt(c.cargo_id, 10)
      if (Number.isFinite(id)) return { cargo_id: id, estado: est }
    }
    return null
  }).filter(Boolean)
}

/** Query params idénticos a la grilla / panel, más formato=mapa_calor. */
export function sicoeBuildMapaCalorSearchParams(bundle) {
  const params = new URLSearchParams()
  const fSicoe = bundle?.fSicoe || {}
  sicoeAppendFSicoeToSearchParams(params, fSicoe, {
    itemsChips: bundle?.itemsChips,
    itemsOp: bundle?.itemsOp,
    q_observacion: bundle?.q_observacion ?? fSicoe.q_observacion,
    q_nodo: bundle?.q_nodo ?? fSicoe.q_nodo,
    panelBundle: {
      panelCapitulos: bundle?.panelCapitulos,
      panelActasRpo: bundle?.panelActasRpo,
    },
  })
  const capas = Array.isArray(bundle?.capasValidacion) ? bundle.capasValidacion : []
  if (capas.length > 0) {
    const ser = sicoeSerializarCapasMapa(capas)
    if (ser.length > 0) {
      params.set('validacion_capas', JSON.stringify(ser))
      if (capas.length > 1) {
        params.set('validacion_capas_op', bundle?.capasValidacionOp === 'or' ? 'or' : 'and')
      }
      const c0 = capas[0]
      if (c0?.cargo_id != null && c0.cargo_id !== '') params.set('cargo_id', String(c0.cargo_id))
      if (c0?.estado != null) params.set('estado_validacion', String(c0.estado))
    }
  }
  params.set('formato', 'mapa_calor')
  return params
}

export function fmtCostoMapa(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(Number(n))
  } catch {
    return String(n)
  }
}
