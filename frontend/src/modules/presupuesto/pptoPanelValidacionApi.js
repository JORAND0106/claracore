import { pptoBuildPresupuestoSearchParams } from './pptoFiltroCatalogo'

/**
 * Agregado servidor para panel Interventoría (sin paginar filas).
 * @param {string} API
 * @param {string} token
 * @param {number} contratoId
 * @param {URLSearchParams} pQuery — mismos params que GET /presupuesto + nivel + capitulo drill
 */
export async function fetchPptoPanelValidacion(API, token, contratoId, pQuery) {
  const qs = pQuery?.toString?.() || ''
  const res = await fetch(
    `${API}/presupuesto/${contratoId}/panel-validacion-interv${qs ? `?${qs}` : ''}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    let det = `Error ${res.status} al cargar panel de validación`
    try {
      const j = await res.json()
      det = j?.detail || det
    } catch { /* ignore */ }
    throw new Error(typeof det === 'string' ? det : JSON.stringify(det))
  }
  return res.json()
}

/** Params de búsqueda + nivel del panel (capitulo | item). */
export function pptoBuildPanelValidacionParams(f, ctx = {}, opts = {}) {
  const p = pptoBuildPresupuestoSearchParams(f, ctx, opts)
  const nivel = opts.nivel === 'item' ? 'item' : 'capitulo'
  p.set('nivel', nivel)
  const capDrill = opts.capituloDrill != null ? String(opts.capituloDrill).trim() : ''
  if (nivel === 'item' && capDrill) {
    p.set('capitulo', capDrill)
  }
  return p
}
