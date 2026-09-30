/**
 * Fechas/horas de plataforma en zona Colombia (America/Bogota, UTC−5).
 * Los timestamps se siguen almacenando en UTC; esto solo afecta la presentación.
 */

export const TZ_COLOMBIA = 'America/Bogota'

/**
 * Interpreta un timestamp de API/Postgres (ISO).
 * - Con Z u offset (`+00:00`, `-05:00`, `+0000`): se respeta.
 * - Sin huso (`2026-09-16T16:27:27.68935`): se asume UTC.
 * Normaliza fracciones de segundo a milisegundos (máx. 3 dígitos) para parsers estrictos.
 */
export function parseTimestampUtc(iso) {
  if (iso == null || iso === '') return null
  try {
    let s = String(iso).trim()
    if (!s) return null
    // Date-only YYYY-MM-DD → mediodía UTC (evita corrimiento de día al formatear)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = new Date(`${s}T12:00:00Z`)
      return Number.isNaN(d.getTime()) ? null : d
    }
    s = s.replace(' ', 'T')
    // Recortar microsegundos/nanos a milisegundos: .68935 → .689
    s = s.replace(/(\.\d{3})\d+(?=(Z|[+-]\d{2}:?\d{2})?$)/, '$1')
    const hasZone =
      /Z$/i.test(s) ||
      /[+-]\d{2}:\d{2}$/.test(s) ||
      /[+-]\d{4}$/.test(s) ||
      /[+-]\d{2}$/.test(s.slice(10))
    if (!hasZone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      s = `${s}Z`
    }
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

/** ¿Parece un timestamp ISO / Postgres (no un número ni texto libre)? */
export function pareceTimestampIso(v) {
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return false
  const s = String(v).trim()
  if (s.length < 10 || s.length > 40) return false
  return (
    /^\d{4}-\d{2}-\d{2}([T\s]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)
  )
}

/**
 * Fecha y hora legible en Colombia, sin fracciones de segundo.
 * Ej.: "16 sept 2026, 11:27 a. m."
 */
export function formatFechaHoraColombia(iso, { withTime = true, fallback = '—' } = {}) {
  if (iso == null || iso === '') return fallback
  const d = parseTimestampUtc(iso)
  if (!d) {
    const raw = String(iso).trim()
    // Si ya era ilegible, no inventar: mostrar sin fracciones al menos
    const clean = raw.replace(/\.\d+(?=Z|[+-]|$)/, '').replace('T', ' ')
    return clean || fallback
  }
  try {
    if (!withTime) {
      return d.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: TZ_COLOMBIA,
      })
    }
    return d.toLocaleString('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: TZ_COLOMBIA,
    })
  } catch {
    return fallback
  }
}

/** Alias histórico usado en Admin / Soporte / Logs. */
export function formatFechaLogBogota(iso) {
  return formatFechaHoraColombia(iso)
}
