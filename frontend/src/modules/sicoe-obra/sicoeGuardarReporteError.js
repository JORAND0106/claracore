/**
 * Mensajes de error al guardar/enviar reportes SicoeObra.
 * Nunca muestra texto técnico en inglés (APIError, PGRST, schema cache) al usuario.
 */

function extractEmbeddedMessage(raw) {
  const s = String(raw || '')
  const mMsg = s.match(/['"]message['"]\s*:\s*['"]([^'"]+)['"]/i)
  const mDetail = s.match(/['"]details?['"]\s*:\s*['"]([^'"]+)['"]/i)
  return [mMsg?.[1], mDetail?.[1]].filter(Boolean).join(' — ')
}

/**
 * @param {unknown} err
 * @returns {string} Mensaje claro en español (sin el aviso de borrador).
 */
export function mensajeErrorGuardarReporte(err) {
  const raw = String(err?.message || err || '').trim()
  if (!raw) {
    return 'No se pudo guardar el reporte. Intente de nuevo.'
  }
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|aborted|econnreset|econnrefused|etimedout/i.test(raw)) {
    return (
      'No hubo conexión con el servidor a tiempo. Comprueba la red, vuelve a intentar o abre con Wi‑Fi. '
      + 'Si usas móvil, el sistema ya envía las líneas en un solo lote: actualiza la app tras el despliegue.'
    )
  }
  if (
    /coords_geojson|geometria_tipo|huella_geojson|huella_tipo|huella_precision/i.test(raw)
    && /PGRST204|schema cache|could not find|APIError|column/i.test(raw)
  ) {
    return (
      'No se pudo guardar el reporte por un desajuste temporal de la base de datos (campos de coordenadas opcionales). '
      + 'Reintente el envío: el borrador se conserva y las coordenadas no son obligatorias para reportar.'
    )
  }
  if (/PGRST204|schema cache|could not find the .+ column|APIError/i.test(raw)) {
    const embedded = extractEmbeddedMessage(raw)
    if (embedded && /coords_geojson|geometria_tipo|huella_/i.test(embedded)) {
      return (
        'No se pudo guardar el reporte por un desajuste temporal de la base de datos (campos de coordenadas opcionales). '
        + 'Reintente el envío: el borrador se conserva y las coordenadas no son obligatorias para reportar.'
      )
    }
    return (
      'No se pudo guardar el reporte por un problema de esquema en la base de datos. '
      + 'Reintente; si el error continúa, avise al administrador sin cerrar este modal.'
    )
  }
  // Detalle del backend ya en español (detail de FastAPI)
  if (
    /no se pudo|debe |complete |indique |sin permiso|no tiene|no encontr|obligator|inválid|invalid/i.test(raw)
    && !/APIError|PGRST|schema cache|Could not find/i.test(raw)
  ) {
    return raw.length > 500 ? `${raw.slice(0, 480)}…` : raw
  }
  if (/APIError|PGRST|Could not find|schema cache/i.test(raw)) {
    return (
      'No se pudo guardar el reporte por un error de base de datos. '
      + 'Reintente; el borrador permanece disponible.'
    )
  }
  return raw.length > 400 ? `${raw.slice(0, 380)}…` : raw
}

/**
 * @param {unknown} err
 * @param {{ borradorId?: string|number|null }} [opts]
 */
export function alertaErrorGuardarReporte(err, { borradorId = null } = {}) {
  const msg = mensajeErrorGuardarReporte(err)
  const hintBorrador = borradorId
    ? `\n\nEl borrador del reporte permanece en el servidor (id ${String(borradorId).slice(0, 8)}…). No cierre el modal: reintente. También hay copia local en este dispositivo.`
    : '\n\nSe conservó un borrador local en este dispositivo; al reabrir «Nuevo reporte» podrá recuperarlo.'
  return `Error guardando reporte: ${msg}${hintBorrador}`
}
