/**
 * Toggle Todo | Aprobado en Informes de Subcontratista (CC-SUB).
 * query: solo_aprobados=true|false (default true = Aprobado).
 */

/** @param {'todo' | 'aprobado'} filtro */
export function soloAprobadosFromFiltro(filtro) {
  return filtro !== 'todo'
}

/** @param {'todo' | 'aprobado'} filtro */
export function qsSoloAprobadosSub(filtro, extraParams = {}) {
  const params = new URLSearchParams()
  params.set('solo_aprobados', soloAprobadosFromFiltro(filtro) ? 'true' : 'false')
  Object.entries(extraParams || {}).forEach(([k, v]) => {
    if (v != null && v !== '') params.set(k, String(v))
  })
  const s = params.toString()
  return s ? `?${s}` : ''
}

/** Une path con query de solo_aprobados (y extras). */
export function pathConFiltroSubAprobacion(path, filtro, extraParams = {}) {
  const base = String(path || '')
  const qi = base.indexOf('?')
  const pathOnly = qi === -1 ? base : base.slice(0, qi)
  const existing = qi === -1 ? '' : base.slice(qi + 1)
  const params = new URLSearchParams(existing)
  params.set('solo_aprobados', soloAprobadosFromFiltro(filtro) ? 'true' : 'false')
  Object.entries(extraParams || {}).forEach(([k, v]) => {
    if (v != null && v !== '') params.set(k, String(v))
  })
  return `${pathOnly}?${params.toString()}`
}
