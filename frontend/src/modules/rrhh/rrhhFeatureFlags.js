/**
 * Flags de producto RRHH.
 *
 * Para reactivar la auditoría documental (botón + colores de celda + gate):
 *   poner RRHH_AUDITORIA_DOCUMENTAL_ACTIVA = true
 *   o VITE_RRHH_AUDITORIA_DOCUMENTAL=1 en el build.
 *
 * Mientras esté en false no se muestra el botón ni se llama a Anthropic
 * (el backend también bloquea consolidar/auditoría).
 */
const _env = String(
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RRHH_AUDITORIA_DOCUMENTAL)
    || '',
).trim().toLowerCase()

export const RRHH_AUDITORIA_DOCUMENTAL_ACTIVA = _env === '1' || _env === 'true' || _env === 'on'
  ? true
  : _env === '0' || _env === 'false' || _env === 'off'
    ? false
    : false // default OFF (costo Anthropic)

export function auditoriaDocumentalActiva() {
  return Boolean(RRHH_AUDITORIA_DOCUMENTAL_ACTIVA)
}
