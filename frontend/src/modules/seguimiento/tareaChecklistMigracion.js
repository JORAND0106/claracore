/**
 * Migración de datos legacy del popup de Tarea hacia columnas por sub-ítem:
 * - Comentarios del ítem (seguimiento_item_comentario) → comentarios del primer sub-ítem
 * - Referencia "Notificar a" a nivel ítem → notificar_a del primer sub-ítem
 */

export function normalizeComentariosSubitem(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({
      id: String(c.id || `cm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`),
      mensaje: String(c.mensaje || c.texto || '').slice(0, 4000),
      autor_nombre: String(c.autor_nombre || c.autor || '').slice(0, 200),
      autor_id: c.autor_id != null ? Number(c.autor_id) : null,
      created_at: c.created_at || new Date().toISOString(),
    }))
    .filter((c) => c.mensaje.trim())
}

export function normalizeNotificarSubitem(it) {
  if (!it || typeof it !== 'object') return null
  const raw = it.notificar_a && typeof it.notificar_a === 'object' ? it.notificar_a : null
  let id = it.notificar_a_id ?? raw?.id ?? raw?.usuario_id ?? null
  const nombre = it.notificar_a_nombre || raw?.nombre || raw?.destinatario_nombre || ''
  let relacion = it.relacion_notificacion || raw?.relacion || raw?.relacion_destinatario || 'referencia'
  if (id == null || id === '') return null
  id = Number(id)
  if (!Number.isFinite(id) || id <= 0) return null
  relacion = String(relacion || 'referencia').toLowerCase()
  if (relacion !== 'asignacion' && relacion !== 'referencia') relacion = 'referencia'
  return {
    id,
    nombre: String(nombre || `#${id}`).slice(0, 200),
    relacion,
  }
}

/**
 * Incorpora comentarios generales del ítem en el primer sub-ítem (sin duplicar por id).
 */
export function mergeLegacyComentariosIntoChecklist(checklist, itemComentarios) {
  const list = Array.isArray(checklist) ? checklist.map((it) => ({ ...it })) : []
  const legacy = normalizeComentariosSubitem(itemComentarios)
  if (!legacy.length) return list
  const existingIds = new Set()
  for (const it of list) {
    for (const c of normalizeComentariosSubitem(it.comentarios)) {
      existingIds.add(String(c.id))
    }
  }
  const toAdd = legacy.filter((c) => !existingIds.has(String(c.id)))
  if (!toAdd.length) return list
  if (!list.length) {
    return [{
      id: `c${Date.now().toString(36)}`,
      texto: '',
      hecho: false,
      estado_gestion: 'abierto',
      fecha: '',
      hora: '',
      imagen: null,
      esquema: null,
      notas: '',
      enlace: '',
      comentarios: toAdd,
      orden: 0,
    }]
  }
  const first = list[0]
  list[0] = {
    ...first,
    comentarios: [...normalizeComentariosSubitem(first.comentarios), ...toAdd],
  }
  return list
}

/**
 * Si ningún sub-ítem tiene Notificar a, copia la referencia legacy del ítem al primero.
 * No toca asignaciones formales del nivel Tarea.
 */
export function mergeLegacyNotificarIntoChecklist(checklist, item) {
  const list = Array.isArray(checklist) ? checklist.map((it) => ({ ...it })) : []
  if (!list.length || !item) return list
  if (list.some((it) => normalizeNotificarSubitem(it))) return list
  const relacion = String(item.relacion_destinatario || '').toLowerCase()
  if (relacion !== 'referencia') return list
  const refId = item.referido_a_id != null ? Number(item.referido_a_id) : null
  const refNombre = item.referido_a_nombre || ''
  if (!refId) return list
  const first = list[0]
  list[0] = {
    ...first,
    notificar_a_id: refId,
    notificar_a_nombre: refNombre || `#${refId}`,
    relacion_notificacion: 'referencia',
    notificar_a: {
      id: refId,
      nombre: refNombre || `#${refId}`,
      relacion: 'referencia',
    },
  }
  return list
}

export function aplicarMigracionLegadoChecklist(checklist, item) {
  let next = Array.isArray(checklist) ? checklist : []
  next = mergeLegacyComentariosIntoChecklist(next, item?.comentarios)
  next = mergeLegacyNotificarIntoChecklist(next, item)
  return next
}
