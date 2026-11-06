/** Fechas/horas en hora local de Colombia (America/Bogota). */

const TZ = 'America/Bogota'

export function formatColombiaDateTime(isoOrDate) {
  if (!isoOrDate) return ''
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  } catch {
    return d.toISOString()
  }
}

export function nowColombiaIso() {
  return new Date().toISOString()
}
