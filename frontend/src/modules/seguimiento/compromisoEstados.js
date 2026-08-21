/** Estados terminales (etiqueta informativa; no ocultan por sí solos en tablas de acta). */
export function esEstadoTerminalCompromiso(estado) {
  const e = String(estado || '').toLowerCase()
  return e === 'cumplido' || e === 'cancelado'
}

/**
 * Archivado de la vista activa vía el botón «marcar cumplido» en Compromisos abiertos.
 * Independiente del valor de estado_gestion.
 */
export function esCompromisoArchivadoRevision(item) {
  const libres = item?.campos_libres
  if (!libres || typeof libres !== 'object') return false
  return libres.archivado_revision === true || libres.archivado_revision === 'true'
}
