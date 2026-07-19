/** Horarios de producción (lun–vie). NO modificar sin acuerdo funcional. */
export const INFORME_PERIODICO_SLOTS_PROD = [
  { key: '0800', startMinutes: 8 * 60 + 0 },
  { key: '1030', startMinutes: 10 * 60 + 30 },
  { key: '1300', startMinutes: 13 * 60 + 0 },
  { key: '1530', startMinutes: 15 * 60 + 30 },
]

/** true en `npm run dev`; false en build prod y en tests node. */
const IS_VITE_DEV = Boolean(import.meta.env?.DEV)

/**
 * TEMPORAL — solo `npm run dev` (import.meta.env.DEV).
 * Eliminar antes de desplegar a producción.
 * Franja 21:08 para validar el modal fuera del horario laboral en local.
 */
const INFORME_PERIODICO_SLOTS_DEV_ONLY = IS_VITE_DEV
  ? [{ key: '2108', startMinutes: 21 * 60 + 8 }]
  : []

/** Slots activos: producción + prueba local (dev). Ordenados por hora. */
export const INFORME_PERIODICO_SLOTS = [
  ...INFORME_PERIODICO_SLOTS_PROD,
  ...INFORME_PERIODICO_SLOTS_DEV_ONLY,
].sort((a, b) => a.startMinutes - b.startMinutes)

const STORAGE_PREFIX = 'cc_informe_periodico_v1'

export function isInformePeriodicoWeekday(date = new Date()) {
  const d = date.getDay()
  return d >= 1 && d <= 5
}

/** Minutos desde medianoche (hora local). */
export function minutesOfDay(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes()
}

function formatSlotId(date, slot) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}_${slot.key}`
}

/**
 * Identificador estable de la ventana horaria activa, p. ej. "2026-07-18_1030".
 * null si fuera de horario o fin de semana (prod).
 */
export function getActiveInformePeriodicoSlotId(date = new Date()) {
  const weekday = isInformePeriodicoWeekday(date)
  const mins = minutesOfDay(date)
  const devSlot = INFORME_PERIODICO_SLOTS_DEV_ONLY[0]

  // Dev local: fin de semana solo dispara la franja temporal 21:08 (no las de producción).
  if (!weekday && IS_VITE_DEV && devSlot && mins >= devSlot.startMinutes) {
    return formatSlotId(date, devSlot)
  }

  if (!weekday) return null

  const first = INFORME_PERIODICO_SLOTS[0].startMinutes
  if (mins < first) return null
  let active = INFORME_PERIODICO_SLOTS[0]
  for (const slot of INFORME_PERIODICO_SLOTS) {
    if (mins >= slot.startMinutes) active = slot
  }
  return formatSlotId(date, active)
}

function storageKey(userId, contratoId, slotId) {
  return `${STORAGE_PREFIX}_${userId}_${contratoId}_${slotId}`
}

export function isInformePeriodicoSlotCompleted(userId, contratoId, slotId) {
  if (!userId || !contratoId || !slotId) return false
  try {
    return localStorage.getItem(storageKey(userId, contratoId, slotId)) === '1'
  } catch {
    return false
  }
}

export function markInformePeriodicoSlotCompleted(userId, contratoId, slotId) {
  if (!userId || !contratoId || !slotId) return
  try {
    localStorage.setItem(storageKey(userId, contratoId, slotId), '1')
  } catch {
    /* quota / private mode */
  }
}

/** true si debe mostrarse el recordatorio ahora (sin considerar copia pendiente en UI). */
export function shouldShowInformePeriodicoReminder(userId, contratoId, date = new Date()) {
  const slotId = getActiveInformePeriodicoSlotId(date)
  if (!slotId) return false
  return !isInformePeriodicoSlotCompleted(userId, contratoId, slotId)
}
