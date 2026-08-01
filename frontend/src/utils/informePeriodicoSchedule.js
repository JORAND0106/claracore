/** Horario del popup de informe de validación (lun–vie). Una sola ventana diaria a las 9:00. */
export const INFORME_PERIODICO_SLOTS_PROD = [
  { key: '0900', startMinutes: 9 * 60 + 0 },
]

/** Slots activos (producción). Ordenados por hora. */
export const INFORME_PERIODICO_SLOTS = [...INFORME_PERIODICO_SLOTS_PROD].sort(
  (a, b) => a.startMinutes - b.startMinutes,
)

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
 * Identificador estable de la ventana horaria activa, p. ej. "2026-08-03_0900".
 * null si fuera de horario o fin de semana.
 * Con un solo slot a las 9:00, la ventana permanece activa el resto del día hábil
 * (hasta que el usuario complete la copia).
 */
export function getActiveInformePeriodicoSlotId(date = new Date()) {
  if (!isInformePeriodicoWeekday(date)) return null

  const mins = minutesOfDay(date)
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
