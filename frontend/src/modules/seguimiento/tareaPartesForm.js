/**
 * Helpers del formulario de partes (crear/editar tarea madre).
 */

import { normEstadoSubitem } from './tareaAvance.js'
import { normalizeNotificarSubitem } from './tareaChecklistMigracion.js'

function nombreUser(u) {
  if (!u) return ''
  return String(u.nombre || u.name || u.email || '').trim() || `#${u.id}`
}

/** Fila de parte editable en el formulario de crear/editar tarea. */
export function newParteItem(partial = {}) {
  const id = partial.id || `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const estado = normEstadoSubitem(partial.estado_gestion, { hecho: !!partial.hecho })
  const notificar = normalizeNotificarSubitem(partial)
  const responsableId = partial.asignado_a_id != null ? Number(partial.asignado_a_id) : null
  return {
    id,
    titulo: partial.titulo || partial.texto || '',
    texto: partial.titulo || partial.texto || '',
    estado_gestion: estado,
    fecha: (partial.fecha || partial.fecha_vencimiento)
      ? String(partial.fecha || partial.fecha_vencimiento).slice(0, 10)
      : '',
    hora: (partial.hora || partial.hora_vencimiento)
      ? String(partial.hora || partial.hora_vencimiento).slice(0, 5)
      : '',
    imagen: partial.imagen || null,
    esquema: partial.esquema || null,
    notas: partial.notas || '',
    enlace: partial.enlace || '',
    orden: partial.orden ?? 0,
    asignado_a_id: responsableId,
    asignado_a_nombre: partial.asignado_a_nombre || '',
    ...(notificar ? {
      notificar_a_id: notificar.id,
      notificar_a_nombre: notificar.nombre,
      relacion_notificacion: notificar.relacion,
      notificar_a: notificar,
    } : {
      notificar_a_id: null,
      notificar_a_nombre: '',
      relacion_notificacion: null,
      notificar_a: null,
    }),
  }
}

/** Serializa partes del formulario al payload de API. */
export function partesToPayload(partes = [], { personal = true, creador = null } = {}) {
  return (Array.isArray(partes) ? partes : [])
    .map((it, i) => {
      const titulo = String(it.titulo || it.texto || '').trim()
      if (!titulo) return null
      const row = {
        titulo,
        texto: titulo,
        estado_gestion: it.estado_gestion || 'abierto',
        fecha_vencimiento: it.fecha || null,
        fecha: it.fecha || null,
        hora_vencimiento: it.hora || null,
        hora: it.hora || null,
        notas: it.notas || '',
        enlace: it.enlace || '',
        orden: it.orden ?? i,
      }
      if (!personal && it.asignado_a_id) {
        row.asignado_a_id = Number(it.asignado_a_id)
        row.asignado_a_nombre = it.asignado_a_nombre || ''
      } else if (personal && creador?.id) {
        row.asignado_a_id = Number(creador.id)
        row.asignado_a_nombre = nombreUser(creador)
      }
      if (it.notificar_a_id) {
        row.notificar_a_id = Number(it.notificar_a_id)
        row.notificar_a_nombre = it.notificar_a_nombre || ''
        row.relacion_notificacion = it.relacion_notificacion || 'referencia'
      }
      if (it.imagen) row.imagen = it.imagen
      if (it.esquema) row.esquema = it.esquema
      return row
    })
    .filter(Boolean)
}

/** Fecha/hora de vencimiento efectiva = parte más próxima. */
export function fechaVencimientoDesdePartes(partes = []) {
  let best = null
  for (const it of Array.isArray(partes) ? partes : []) {
    const f = it?.fecha ? String(it.fecha).slice(0, 10) : ''
    if (!f) continue
    const h = it?.hora ? String(it.hora).slice(0, 5) : ''
    const ts = Date.parse(`${f}T${h || '23:59'}:00`)
    if (Number.isNaN(ts)) continue
    if (!best || ts < best.ts) {
      best = { ts, fecha: f, hora: h || null }
    }
  }
  return best ? { fecha: best.fecha, hora: best.hora } : { fecha: null, hora: null }
}
