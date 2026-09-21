/** Normaliza errores HTTP de RRHH preservando status, payload y códigos de negocio. */
export function buildRrhhApiError(res, payload) {
  let detail = `Error ${res.status}`
  const d = payload?.detail
  if (typeof d === 'string') detail = d
  else if (Array.isArray(d)) detail = d.map((x) => x.msg || JSON.stringify(x)).join('; ')
  else if (d && typeof d === 'object') {
    detail = d.mensaje || d.detail || d.message || JSON.stringify(d)
  } else if (payload?.message) {
    detail = payload.message
  }

  const err = new Error(detail)
  err.status = res.status
  err.payload = payload

  if (d && typeof d === 'object') {
    err.codigo = d.codigo || d.code || null
    err.trabajador = d.trabajador || null
  }
  if (payload?.codigo || payload?.code) {
    err.codigo = err.codigo || payload.codigo || payload.code
  }
  if (payload?.trabajador) {
    err.trabajador = err.trabajador || payload.trabajador
  }
  if (payload?.trabajador_id && err.trabajador && err.trabajador.id == null) {
    err.trabajador = { ...err.trabajador, id: payload.trabajador_id }
  } else if (payload?.trabajador_id && !err.trabajador) {
    err.trabajador = { id: payload.trabajador_id }
  }

  // Unificar reingreso (API: REINGRESO_REQUERIDO / reingreso_requerido)
  if (
    payload?.reingreso_requerido
    || err.codigo === 'REINGRESO_REQUERIDO'
    || err.codigo === 'reingreso'
  ) {
    err.codigo = 'reingreso'
  }

  return err
}
