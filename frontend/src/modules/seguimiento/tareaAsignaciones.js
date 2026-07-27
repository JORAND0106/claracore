/**
 * Asignaciones formales multi-destinatario en tareas personales.
 * Fuente: campos_libres.asignaciones (y legado asignado_a_id).
 */

export function asignacionesDe(item) {
  if (!item) return []
  const libres = item.campos_libres && typeof item.campos_libres === 'object' ? item.campos_libres : {}
  const raw = Array.isArray(libres.asignaciones) ? libres.asignaciones : []
  if (raw.length) {
    return raw
      .filter((a) => a && (a.usuario_id != null || a.id != null))
      .map((a) => ({
        usuario_id: Number(a.usuario_id ?? a.id),
        nombre: a.nombre || a.asignado_a_nombre || '',
        estado_gestion: String(a.estado_gestion || 'abierto').toLowerCase(),
        updated_at: a.updated_at || null,
      }))
  }
  if (
    item.relacion_destinatario === 'asignacion'
    && item.asignado_a_id
    && Number(item.asignado_a_id) !== Number(item.created_by)
  ) {
    return [{
      usuario_id: Number(item.asignado_a_id),
      nombre: item.asignado_a_nombre || '',
      estado_gestion: String(item.estado_gestion || 'abierto').toLowerCase(),
      updated_at: null,
    }]
  }
  return []
}

export function esAsignadoFormal(item, usuarioId) {
  const uid = Number(usuarioId)
  if (!uid) return false
  return asignacionesDe(item).some((a) => Number(a.usuario_id) === uid)
}

export function destinatarioLabel(item) {
  if (!item) return '—'
  if (item.relacion_destinatario === 'referencia') {
    return item.referido_a_nombre || item.asignado_a_nombre || '—'
  }
  const asigns = asignacionesDe(item)
  if (asigns.length > 1) {
    return asigns.map((a) => a.nombre || `#${a.usuario_id}`).join(', ')
  }
  if (asigns.length === 1) return asigns[0].nombre || item.asignado_a_nombre || '—'
  return item.asignado_a_nombre || '—'
}

export function miEstadoEnAsignaciones(asignaciones, usuarioId) {
  const uid = Number(usuarioId)
  const hit = (asignaciones || []).find((a) => Number(a.usuario_id) === uid)
  return hit ? String(hit.estado_gestion || 'abierto').toLowerCase() : null
}
