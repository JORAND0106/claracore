/**
 * Política de polling para jobs PDF FO-IDU-EO-04
 * (GET /informes/{contrato}/ccd/pdf-job/{id}/estado).
 *
 * Evita reintentos infinitos cuando el job ya no existe (404) y
 * limita el tiempo total de espera.
 */

/** Tiempo máximo de polling (el TTL del job en disco es ~30 min). */
export const FO_EO04_POLL_MAX_MS = 25 * 60 * 1000

/** Fallos consecutivos no-404 (red / 5xx) antes de abortar. */
export const FO_EO04_POLL_MAX_CONSEC_FAIL = 5

export function mensajeJobPdfNoEncontrado() {
  return (
    'El trabajo de generación del PDF ya no existe o expiró en el servidor. ' +
    'Detenga e inicie de nuevo la generación (no se seguirá consultando ese job).'
  )
}

export function mensajeJobPdfTimeout(minutos) {
  const m = Math.max(1, Math.round(Number(minutos) || 25))
  return (
    `La generación del PDF superó el tiempo máximo de espera (${m} min). ` +
    'Detenga el proceso e intente de nuevo; si el volumen es muy alto, espere a que el servidor termine un intento previo.'
  )
}

export function mensajeJobPdfInalcanzable() {
  return (
    'No se pudo consultar el estado del trabajo de PDF tras varios intentos. ' +
    'Revise la conexión e inicie de nuevo la generación.'
  )
}

/**
 * Intervalo entre polls: más frecuente al inicio, luego backoff para no saturar
 * Application Insights en jobs largos.
 */
export function intervaloPollJobPdfMs(elapsedMs) {
  const t = Math.max(0, Number(elapsedMs) || 0)
  if (t < 30_000) return 1200
  if (t < 120_000) return 2000
  if (t < 300_000) return 3500
  return 5000
}

/**
 * Decide si seguir haciendo polling tras una respuesta HTTP de /estado.
 * @param {{ httpStatus: number|null, ok: boolean, elapsedMs: number, consecFails: number }} args
 * @returns {{ action: 'stop'|'retry'|'ok', delayMs?: number, consecFails?: number, message?: string, reason?: string }}
 */
export function decidirPollEstadoJobPdf({
  httpStatus = null,
  ok = false,
  elapsedMs = 0,
  consecFails = 0,
} = {}) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0)
  if (elapsed >= FO_EO04_POLL_MAX_MS) {
    return {
      action: 'stop',
      reason: 'timeout',
      message: mensajeJobPdfTimeout(FO_EO04_POLL_MAX_MS / 60000),
    }
  }

  const status = httpStatus == null ? null : Number(httpStatus)
  if (status === 404 || status === 410) {
    return {
      action: 'stop',
      reason: 'not_found',
      message: mensajeJobPdfNoEncontrado(),
    }
  }

  if (!ok) {
    const fails = Math.max(0, Number(consecFails) || 0) + 1
    if (fails >= FO_EO04_POLL_MAX_CONSEC_FAIL) {
      return {
        action: 'stop',
        reason: 'unreachable',
        message: mensajeJobPdfInalcanzable(),
      }
    }
    return {
      action: 'retry',
      reason: 'transient',
      consecFails: fails,
      delayMs: Math.max(intervaloPollJobPdfMs(elapsed), 1500),
    }
  }

  return {
    action: 'ok',
    consecFails: 0,
    delayMs: intervaloPollJobPdfMs(elapsed),
  }
}
