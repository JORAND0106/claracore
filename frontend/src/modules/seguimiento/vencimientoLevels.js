/**
 * Niveles de vencimiento 1–5 (iconografía propia, misma lógica visual de criticidad).
 *
 * Ventana estándar: 5 días antes del vencimiento.
 * Si el plazo asignado (creación → vencimiento) es menor a 5 días, se comprime
 * la escala para iniciar más cerca del crítico.
 *
 * Ejemplo plazo 2 días: al crear inicia en nivel 4; el día del vencimiento = 5.
 */
import { asignacionesDe, esAsignadoFormal } from './tareaAsignaciones.js'

export const VENCIMIENTO_NIVELES = [
  { key: 1, emoji: '🟢', color: '#0EA5E9', label: 'Holgado' },
  { key: 2, emoji: '🟡', color: '#65A30D', label: 'Atención' },
  { key: 3, emoji: '🟠', color: '#CA8A04', label: 'Próximo' },
  { key: 4, emoji: '🔴', color: '#EA580C', label: 'Urgente' },
  { key: 5, emoji: '⛔', color: '#DC2626', label: 'Vence hoy / crítico' },
]

function parseDateOnly(raw) {
  if (!raw) return null
  const s = String(raw).slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime()
  return Math.round(ms / 86400000)
}

/** Fecha "hoy" en Bogotá aproximada vía offset fijo -5 (suficiente para UI). */
export function hoyBogotaDate() {
  const now = new Date()
  const bogota = new Date(now.getTime() - 5 * 60 * 60 * 1000)
  return new Date(bogota.getUTCFullYear(), bogota.getUTCMonth(), bogota.getUTCDate())
}

/**
 * @returns {number|null} nivel 1–5 o null si no hay fecha de vencimiento
 */
export function calcularNivelVencimiento({
  fechaVencimiento,
  fechaCreacion,
  hoy = hoyBogotaDate(),
} = {}) {
  const due = parseDateOnly(fechaVencimiento)
  if (!due) return null
  const created = parseDateOnly(fechaCreacion) || hoy
  const span = Math.max(1, daysBetween(created, due))
  const daysLeft = daysBetween(hoy, due)
  if (daysLeft < 0) return 5

  // Nivel al crear: 6 - min(span, 5) → span 5→1, span 2→4, span 1→5
  const start = Math.max(1, 6 - Math.min(span, 5))
  if (daysLeft >= span) return start

  // Interpola de start (al crear) a 5 (día de vencimiento)
  const t = daysLeft / span // 1 al inicio del plazo, 0 al vencer
  const level = Math.round(5 - t * (5 - start))
  return Math.max(1, Math.min(5, level))
}

export function metaNivelVencimiento(nivel) {
  const n = Number(nivel)
  return VENCIMIENTO_NIVELES.find((x) => x.key === n) || null
}

/**
 * Fecha base para el cálculo de nivel de vencimiento.
 * Prioriza columna dedicada; si no existe (migración pendiente), usa
 * `campos_libres.nivel_desde` y luego created_at / vencimiento original.
 */
export function fechaBaseNivel(item) {
  if (!item) return null
  const libres = item.campos_libres && typeof item.campos_libres === 'object'
    ? item.campos_libres
    : {}
  return item.fecha_base_nivel
    || libres.nivel_desde
    || item.created_at
    || item.fecha_vencimiento_original
    || null
}

/**
 * Para tareas personales: vencimiento efectivo = sub-ítem de checklist
 * con fecha más próxima. Compromisos y fallback: fecha_vencimiento del ítem.
 */
export function fechaVencimientoEfectiva(item) {
  if (!item) return { fecha: null, hora: null }
  if (item.origen === 'tarea') {
    const libres = item.campos_libres && typeof item.campos_libres === 'object'
      ? item.campos_libres
      : {}
    const checklist = Array.isArray(libres.checklist) ? libres.checklist : []
    let best = null
    for (const it of checklist) {
      const f = parseDateOnly(it?.fecha)
      if (!f) continue
      const ts = f.getTime() + _horaMs(it?.hora)
      if (!best || ts < best.ts) {
        best = {
          ts,
          fecha: String(it.fecha).slice(0, 10),
          hora: it.hora ? String(it.hora).slice(0, 5) : null,
        }
      }
    }
    if (best) return { fecha: best.fecha, hora: best.hora }
  }
  return {
    fecha: item.fecha_vencimiento ? String(item.fecha_vencimiento).slice(0, 10) : null,
    hora: item.hora_vencimiento ? String(item.hora_vencimiento).slice(0, 5) : null,
  }
}

/** Nivel de vencimiento usando la fecha efectiva (checklist más próxima en tareas). */
export function nivelVencimientoItem(item, hoy = hoyBogotaDate()) {
  const due = fechaVencimientoEfectiva(item)
  return calcularNivelVencimiento({
    fechaVencimiento: due.fecha,
    fechaCreacion: fechaBaseNivel(item),
    hoy,
  })
}

/** Ordenación: más crítico / más próximo primero; sin fecha al final. */
export function sortByProximidadVencimiento(rows) {
  return [...(rows || [])].sort((a, b) => {
    const ea = fechaVencimientoEfectiva(a)
    const eb = fechaVencimientoEfectiva(b)
    const da = parseDateOnly(ea.fecha)
    const db = parseDateOnly(eb.fecha)
    if (!da && !db) return (Number(b.id) || 0) - (Number(a.id) || 0)
    if (!da) return 1
    if (!db) return -1
    const ta = da.getTime() + _horaMs(ea.hora)
    const tb = db.getTime() + _horaMs(eb.hora)
    if (ta !== tb) return ta - tb
    return (Number(a.id) || 0) - (Number(b.id) || 0)
  })
}

function _horaMs(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}/.test(String(hhmm))) return 0
  const [h, m] = String(hhmm).split(':').map(Number)
  return ((h || 0) * 60 + (m || 0)) * 60 * 1000
}

export function tipoLaborLabel(item, usuarioId) {
  if (!item) return '—'
  if (item.origen === 'compromiso') {
    if (Number(item.asignado_a_id) === Number(usuarioId)) return 'Debo entregar'
    if (Number(item.solicitante_id) === Number(usuarioId) || Number(item.created_by) === Number(usuarioId)) {
      return 'Asignada por mí'
    }
    return 'Compromiso'
  }
  // tarea
  if (item.relacion_destinatario === 'referencia' && Number(item.referido_a_id) === Number(usuarioId)) {
    return 'Referencia recibida'
  }
  const asigns = asignacionesDe(item)
  const soyAsignado = esAsignadoFormal(item, usuarioId)
  if (item.relacion_destinatario === 'asignacion' && soyAsignado
    && Number(item.created_by) !== Number(usuarioId)) {
    return asigns.length > 1 ? 'Delegada a mí (compartida)' : 'Delegada a mí'
  }
  if (Number(item.created_by) === Number(usuarioId)
    && item.relacion_destinatario === 'asignacion'
    && asigns.some((a) => Number(a.usuario_id) !== Number(usuarioId))) {
    return asigns.length > 1 ? `Delegada a ${asigns.length}` : 'Asignada a otro'
  }
  if (Number(item.created_by) === Number(usuarioId)
    && item.relacion_destinatario === 'referencia') {
    return 'Referencia enviada'
  }
  if (Number(item.asignado_a_id) === Number(usuarioId) || soyAsignado) return 'Debo entregar'
  return 'Tarea'
}

/**
 * Columna de origen/remitente:
 * - Compromiso de acta → Acta Nº X · fecha
 * - Tarea personal (creador = destinatario) → —
 * - Tarea enviada por otro → nombre de quien la envió
 */
export function origenRemitenteLabel(item, usuarioId) {
  if (!item) return '—'
  if (item.origen === 'compromiso' && item.acta_id) {
    const num = item.acta_numero
      || (item.acta_consecutivo != null ? `Acta Nº ${item.acta_consecutivo}` : null)
      || (item.acta?.consecutivo != null ? `Acta Nº ${item.acta.consecutivo}` : `Acta #${item.acta_id}`)
    const fecha = item.acta_fecha || item.acta?.fecha_reunion
    if (fecha) {
      const s = String(fecha).slice(0, 10)
      const [y, m, d] = s.split('-')
      const f = y && m && d ? `${d}/${m}/${y}` : s
      return `${num} · ${f}`
    }
    return num
  }
  const creatorId = Number(item.created_by || 0)
  const assigneeId = Number(item.asignado_a_id || 0)
  const referidoId = Number(item.referido_a_id || 0)
  const uid = Number(usuarioId || 0)
  const esPersonalEstricta = creatorId
    && creatorId === assigneeId
    && !referidoId
    && item.relacion_destinatario !== 'asignacion'
    && item.relacion_destinatario !== 'referencia'
  if (esPersonalEstricta) return '—'

  const enviadaPorOtro = (
    (item.relacion_destinatario === 'asignacion' && (
      (assigneeId === uid && creatorId !== uid) || esAsignadoFormal(item, uid)
    ) && creatorId !== uid)
    || (item.relacion_destinatario === 'referencia' && referidoId === uid && creatorId !== uid)
    || (assigneeId === uid && creatorId && creatorId !== uid)
  )
  if (enviadaPorOtro) {
    const quien = item.solicitante_nombre
      || item.created_by_nombre
      || (creatorId ? `Usuario #${creatorId}` : null)
    if (!quien) return '—'
    if (item.relacion_destinatario === 'asignacion') return `Delegó: ${quien}`
    if (item.relacion_destinatario === 'referencia') return `Referencia de: ${quien}`
    return quien
  }
  if (creatorId && creatorId !== uid && (assigneeId === uid || referidoId === uid)) {
    return item.created_by_nombre || item.solicitante_nombre || `Usuario #${creatorId}`
  }
  return '—'
}
