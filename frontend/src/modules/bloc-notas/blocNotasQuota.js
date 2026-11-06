/** Detección de cuota llena (sin jerga técnica al usuario). */

export function isQuotaExceededError(err) {
  if (!err) return false
  const name = err.name || err.code || ''
  const msg = String(err.message || err || '')
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(msg) ||
    /almacenamiento/i.test(msg)
  )
}

export const QUOTA_FULL_MESSAGE =
  'El espacio de este dispositivo está lleno. Libere espacio o sincronice cuando haya conexión.'
