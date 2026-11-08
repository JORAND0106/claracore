/** Preferencia y helpers del modo Retroactivo | Actualizado. */

export const MODO_ACTUALIZADO = 'actualizado'
export const MODO_RETROACTIVO = 'retroactivo'

function prefKey(userId, contratoId) {
  return `almacen_modo_retro_${userId || 'u'}_${contratoId || 'c'}`
}

export function leerPreferenciaModo(userId, contratoId) {
  try {
    const v = localStorage.getItem(prefKey(userId, contratoId))
    if (v === MODO_RETROACTIVO || v === MODO_ACTUALIZADO) return v
  } catch {
    /* ignore */
  }
  return MODO_ACTUALIZADO
}

export function guardarPreferenciaModo(userId, contratoId, modo) {
  try {
    localStorage.setItem(prefKey(userId, contratoId), modo === MODO_RETROACTIVO ? MODO_RETROACTIVO : MODO_ACTUALIZADO)
  } catch {
    /* ignore */
  }
}

export function resolverModoInicial(estadoApi, userId, contratoId) {
  if (!estadoApi?.puede_usar_modo) return MODO_ACTUALIZADO
  const pref = leerPreferenciaModo(userId, contratoId)
  return pref === MODO_RETROACTIVO ? MODO_RETROACTIVO : MODO_ACTUALIZADO
}

export function marcaRetroactivoVisible(row) {
  if (!row) return false
  if (!(row.es_retroactivo === true || row.es_retroactivo === 'true' || row.es_retroactivo === 't')) return false
  return !row.retroactivo_validado_at
}

/** Fecha mínima razonable (10 años atrás) si el API no envía inicio de contrato. */
export function fechaMinimaHechoDefault() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 10)
  return d.toISOString().slice(0, 10)
}
