/** Mensajes de error en español para carga de Auditoría (sin deps). */
export function mensajeErrorCarga(err, fallback) {
  const raw = String(err?.message || err || '').trim()
  if (!raw) return fallback || 'No se pudieron cargar los hallazgos.'
  if (/load failed|failed to fetch|networkerror|network request failed|abort|fetch failed|timeout|econnreset|econnrefused|etimedout/i.test(raw)) {
    return 'No se pudieron cargar o sincronizar los hallazgos. Compruebe la conexión e intente de nuevo.'
  }
  if (raw.length > 280 || /<!DOCTYPE|<html/i.test(raw)) {
    return fallback || 'No se pudieron cargar los hallazgos.'
  }
  return raw
}
