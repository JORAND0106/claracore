/**
 * Filtro temporal de la grilla de presupuesto a partir de una selección en el plano.
 * Vive solo en memoria de la sesión: no se guarda en localStorage ni en la sesión de filtros.
 */

export const MSG_FILTRO_PLANO_VACIO =
  'Ninguna entidad seleccionada en el plano corresponde a un registro del presupuesto.'

export function filtroPlanoEstaActivo(filtroPlano) {
  return !!(
    filtroPlano
    && !filtroPlano.sinCoincidencias
    && Array.isArray(filtroPlano.registros)
    && filtroPlano.registros.length > 0
  )
}

/** Mientras el filtro del plano está activo, la grilla muestra solo esos registros. */
export function grillaConFiltroPlano(registrosFiltrados, filtroPlano) {
  if (!filtroPlanoEstaActivo(filtroPlano)) return registrosFiltrados
  return filtroPlano.registros
}

export function mensajeFiltroPlano(filtroPlano) {
  if (!filtroPlano) return ''
  if (filtroPlanoEstaActivo(filtroPlano)) {
    const n = filtroPlano.registros.length
    return `Filtro desde el plano · ${n} registro${n === 1 ? '' : 's'}`
  }
  const custom = String(filtroPlano.mensaje || '').trim()
  return custom || MSG_FILTRO_PLANO_VACIO
}

/**
 * Normaliza la respuesta de GET /cad-queue/{id}/filtro-activo.
 * Devuelve null si no hay una operación nueva que aplicar.
 */
export function interpretarFiltroActivo(data, opVistos) {
  if (!data || !data.pendiente) return null
  const opId = Number(data.op_id)
  if (!Number.isFinite(opId) || opId <= 0) return null
  if (opVistos && opVistos.has(opId)) return null
  const registros = Array.isArray(data.registros) ? data.registros : []
  const idsDesdePayload = Array.isArray(data.ids)
    ? data.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
    : []
  const ids = idsDesdePayload.length
    ? idsDesdePayload
    : registros.map((r) => Number(r?.id)).filter((n) => Number.isFinite(n) && n > 0)
  const sinCoincidencias = registros.length === 0
  return {
    opId,
    ids: sinCoincidencias ? [] : ids,
    registros: sinCoincidencias ? [] : registros,
    sinCoincidencias,
    mensaje: data.mensaje || '',
  }
}
