/**
 * Resolve PUT body for nivelación lecturas (online shape vs legacy filas).
 * Separado del router offline para poder testear sin deps de IndexedDB/uuid.
 */
import { filasToLecturas, lecturasToFilas } from '../../../utils/topografia_nivelacion.js'

/**
 * El PUT online envía `{ lecturas, tipo_nivel }`.
 * Compat: también acepta `{ filas, tipo_nivel }` o un array de lecturas/filas.
 */
export function resolverPayloadLecturasNivelacionOffline(parsed) {
  const body = parsed && typeof parsed === 'object' ? parsed : {}
  const tipoNivel = body.tipo_nivel || 'electronico'
  let lecturas = []
  let filas = []

  if (Array.isArray(body.lecturas)) {
    lecturas = body.lecturas
    filas = lecturasToFilas(lecturas, tipoNivel)
  } else if (Array.isArray(body.filas)) {
    filas = body.filas
    lecturas = filasToLecturas(filas, tipoNivel)
  } else if (Array.isArray(body)) {
    // Heurística: filas de UI tienen vplus/vi/vminus; lecturas API tienen tipo_lectura
    const pareceLecturaApi = body.some((x) => x && (x.tipo_lectura != null || x.hilo_medio != null || x.hilo_superior != null)
      && x.vplus == null && x.vi == null && x.vminus == null)
    if (pareceLecturaApi) {
      lecturas = body
      filas = lecturasToFilas(lecturas, tipoNivel)
    } else {
      filas = body
      lecturas = filasToLecturas(filas, tipoNivel)
    }
  }

  return { lecturas, filas, tipo_nivel: tipoNivel }
}

/**
 * Si hay cartera local pendiente de sync más rica que el GET del servidor,
 * preferir las lecturas locales (evita UI vacía tras PUT offline).
 */
export function preferPendingNivelacionDetail(serverData, existing) {
  if (!serverData?.nivelacion?.id) return serverData
  if (!existing?._pending_sync) return serverData
  const localN = Array.isArray(existing.lecturas) ? existing.lecturas.length : 0
  const remoteN = Array.isArray(serverData.lecturas) ? serverData.lecturas.length : 0
  if (remoteN >= localN) return serverData
  return {
    ...serverData,
    lecturas: existing.lecturas,
    vista_local: existing.vista_local,
    _pending_sync: true,
    nivelacion: {
      ...serverData.nivelacion,
      _pending_sync: true,
      tipo_nivel: existing.nivelacion?.tipo_nivel || serverData.nivelacion?.tipo_nivel,
    },
  }
}
