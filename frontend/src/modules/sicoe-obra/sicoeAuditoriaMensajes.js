/**
 * Mensajes de error en español para carga/sincronización de Auditoría.
 * Distingue timeout/servidor vs falla real de conexión.
 */

function extractHttpStatus(err) {
  if (err == null) return null
  if (typeof err.status === 'number') return err.status
  if (typeof err.httpStatus === 'number') return err.httpStatus
  const raw = String(err?.message || err || '')
  const m = raw.match(/\b([45]\d{2})\b/)
  return m ? Number(m[1]) : null
}

function extractDetailText(err) {
  const raw = String(err?.message || err || '').trim()
  if (!raw) return ''
  // FastAPI: {"detail":"..."} o {"detail":[{msg}]}
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const j = JSON.parse(raw)
      if (typeof j?.detail === 'string') return j.detail
      if (Array.isArray(j?.detail) && j.detail[0]?.msg) return String(j.detail[0].msg)
      if (typeof j?.message === 'string') return j.message
    } catch { /* ignore */ }
  }
  return raw
}

/**
 * @param {any} err
 * @param {string} [fallback]
 * @param {{ status?: number, context?: 'carga'|'sync' }} [opts]
 */
export function mensajeErrorCarga(err, fallback, opts = {}) {
  const status = opts.status ?? extractHttpStatus(err)
  const raw = extractDetailText(err)
  const fb = fallback || 'No se pudieron cargar los hallazgos.'
  const ctxSync = opts.context === 'sync' || /sincroniz/i.test(fb)

  if (status === 401 || status === 403) {
    return 'No tiene permiso para ver o sincronizar los hallazgos de auditoría.'
  }
  if (status === 404) {
    return 'No se encontró el análisis de hallazgos de este contrato.'
  }
  if (status === 408 || status === 504 || status === 502 || status === 524) {
    return ctxSync
      ? 'El análisis de hallazgos tardó demasiado y el servidor cortó la petición. Intente de nuevo con Reintentar.'
      : 'La carga de hallazgos tardó demasiado y el servidor cortó la petición. Intente de nuevo.'
  }
  if (status === 500 || status === 503) {
    if (raw && raw.length < 220 && !/^error\s*500/i.test(raw) && !/<!DOCTYPE|<html/i.test(raw)) {
      return raw
    }
    return ctxSync
      ? 'El servidor no pudo completar el análisis de hallazgos. Intente de nuevo; si persiste, contacte a soporte.'
      : 'El servidor no pudo cargar los hallazgos. Intente de nuevo.'
  }

  if (!raw) return fb

  // Abort por timeout del cliente
  if (/timeout|timed?\s*out|aborted|aborterror/i.test(raw) && !/user aborted/i.test(raw)) {
    return ctxSync
      ? 'El análisis de hallazgos tardó demasiado. Intente de nuevo con Reintentar.'
      : 'La carga de hallazgos tardó demasiado. Intente de nuevo.'
  }

  // "Load failed" / "Failed to fetch" en Safari/Chrome suele ser corte de proxy/timeout,
  // no necesariamente falta de red (el resto de la plataforma sigue funcionando).
  if (/load failed|failed to fetch|fetch failed/i.test(raw)) {
    return ctxSync
      ? 'No se pudo completar la sincronización de hallazgos: el servidor no respondió a tiempo o cortó la petición. No es un problema de su conexión local. Use Reintentar.'
      : 'No se pudieron cargar los hallazgos: el servidor no respondió a tiempo o cortó la petición. Use Reintentar.'
  }

  // Falla real de red / DNS
  if (/networkerror|network request failed|econnrefused|enotfound|offline|no internet|failed to connect/i.test(raw)) {
    return 'No hay conexión con el servidor. Compruebe la red e intente de nuevo.'
  }

  if (raw.length > 280 || /<!DOCTYPE|<html/i.test(raw)) {
    return fb
  }
  return raw
}

/** Formatea ISO a fecha/hora local es-CO. */
export function fmtFechaHallazgosGuardados(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}
