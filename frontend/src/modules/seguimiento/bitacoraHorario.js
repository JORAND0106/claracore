/**
 * Horario laboral por contrato (Bitácora) + cálculo de horas / horas extra.
 * Horas en America/Bogota; formato HH:MM.
 */

export const DIAS_SEMANA = [
  { key: 'lun', label: 'Lunes', jsDay: 1 },
  { key: 'mar', label: 'Martes', jsDay: 2 },
  { key: 'mie', label: 'Miércoles', jsDay: 3 },
  { key: 'jue', label: 'Jueves', jsDay: 4 },
  { key: 'vie', label: 'Viernes', jsDay: 5 },
  { key: 'sab', label: 'Sábado', jsDay: 6 },
  { key: 'dom', label: 'Domingo', jsDay: 0 },
]

export const HORA_INGRESO_DEFAULT = '07:30'
export const HORA_SALIDA_DEFAULT = '16:30'
export const ALMUERZO_INICIO_DEFAULT = '12:00'
export const ALMUERZO_FIN_DEFAULT = '13:00'

function emptyDiaNoLaborable() {
  return {
    laborable: false,
    entrada: '',
    salida: '',
    almuerzo_inicio: '',
    almuerzo_fin: '',
  }
}

function diaLaborableDefault() {
  return {
    laborable: true,
    entrada: HORA_INGRESO_DEFAULT,
    salida: HORA_SALIDA_DEFAULT,
    almuerzo_inicio: ALMUERZO_INICIO_DEFAULT,
    almuerzo_fin: ALMUERZO_FIN_DEFAULT,
  }
}

/** Horario por defecto (Lun–Vie 07:30–16:30 con almuerzo 12:00–13:00). */
export function horarioDefault(vigenteDesde = null) {
  const dias = {}
  for (const d of DIAS_SEMANA) {
    dias[d.key] = (d.key === 'sab' || d.key === 'dom')
      ? emptyDiaNoLaborable()
      : diaLaborableDefault()
  }
  return {
    vigente_desde: vigenteDesde || hoyISOBogotaLocal(),
    dias,
  }
}

export function hoyISOBogotaLocal() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/** Parsea HH:MM a minutos desde medianoche; null si inválido. */
export function hhmmAMinutos(raw) {
  const s = String(raw || '').trim().slice(0, 5)
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null
  return h * 60 + min
}

export function minutosAHhmm(mins) {
  if (mins == null || !Number.isFinite(mins)) return ''
  const n = Math.max(0, Math.round(mins))
  const h = Math.floor(n / 60) % 24
  const m = n % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Horas laborables de un día (salida−entrada−almuerzo). 0 si no laborable o incompleto. */
export function horasLaborablesDia(dia) {
  if (!dia || !dia.laborable) return 0
  const ini = hhmmAMinutos(dia.entrada)
  const fin = hhmmAMinutos(dia.salida)
  if (ini == null || fin == null || fin <= ini) return 0
  let total = fin - ini
  const a0 = hhmmAMinutos(dia.almuerzo_inicio)
  const a1 = hhmmAMinutos(dia.almuerzo_fin)
  if (a0 != null && a1 != null && a1 > a0) {
    const solapa0 = Math.max(ini, a0)
    const solapa1 = Math.min(fin, a1)
    if (solapa1 > solapa0) total -= (solapa1 - solapa0)
  }
  return Math.max(0, total) / 60
}

export function horasSemanales(horario) {
  const dias = horario?.dias || {}
  let sum = 0
  for (const d of DIAS_SEMANA) {
    sum += horasLaborablesDia(dias[d.key])
  }
  return Math.round(sum * 100) / 100
}

export function keyDiaDesdeFechaISO(fechaISO) {
  const f = String(fechaISO || '').slice(0, 10)
  const m = f.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  // Mediodía UTC-5 aproximado vía Date local construido a mediodía
  const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`)
  if (Number.isNaN(dt.getTime())) return null
  const js = dt.getDay() // 0=dom
  const found = DIAS_SEMANA.find((d) => d.jsDay === js)
  return found?.key || null
}

/**
 * Normaliza payload de admin / API a forma canónica.
 * Si viene vacío/null → horarioDefault.
 */
export function normalizeHorario(raw, { vigenteDesde } = {}) {
  if (!raw || typeof raw !== 'object') return horarioDefault(vigenteDesde)
  const base = horarioDefault(raw.vigente_desde || vigenteDesde)
  const src = raw.dias && typeof raw.dias === 'object' ? raw.dias : raw
  for (const d of DIAS_SEMANA) {
    const row = src[d.key]
    if (!row || typeof row !== 'object') continue
    base.dias[d.key] = {
      laborable: Boolean(row.laborable),
      entrada: String(row.entrada || '').slice(0, 5),
      salida: String(row.salida || '').slice(0, 5),
      almuerzo_inicio: String(row.almuerzo_inicio || '').slice(0, 5),
      almuerzo_fin: String(row.almuerzo_fin || '').slice(0, 5),
    }
  }
  if (raw.vigente_desde) base.vigente_desde = String(raw.vigente_desde).slice(0, 10)
  return base
}

/** Día del horario aplicable a una fecha ISO. */
export function diaHorarioParaFecha(horario, fechaISO) {
  const h = normalizeHorario(horario)
  const key = keyDiaDesdeFechaISO(fechaISO)
  if (!key) return diaLaborableDefault()
  return h.dias[key] || emptyDiaNoLaborable()
}

/** Horas de entrada/salida a precargar para personal ese día. */
export function horasPrecargaDesdeHorario(horario, fechaISO) {
  const dia = diaHorarioParaFecha(horario, fechaISO)
  if (!dia.laborable) {
    return {
      hora_ingreso: HORA_INGRESO_DEFAULT,
      hora_salida: HORA_SALIDA_DEFAULT,
      laborable: false,
      almuerzo_inicio: dia.almuerzo_inicio || '',
      almuerzo_fin: dia.almuerzo_fin || '',
      horas_jornada: 0,
    }
  }
  return {
    hora_ingreso: dia.entrada || HORA_INGRESO_DEFAULT,
    hora_salida: dia.salida || HORA_SALIDA_DEFAULT,
    laborable: true,
    almuerzo_inicio: dia.almuerzo_inicio || '',
    almuerzo_fin: dia.almuerzo_fin || '',
    horas_jornada: horasLaborablesDia(dia),
  }
}

/**
 * Horas trabajadas descontando almuerzo del día (si aplica dentro del rango).
 */
export function horasTrabajadas({
  hora_ingreso,
  hora_salida,
  almuerzo_inicio = '',
  almuerzo_fin = '',
} = {}) {
  const ini = hhmmAMinutos(hora_ingreso)
  const fin = hhmmAMinutos(hora_salida)
  if (ini == null || fin == null || fin <= ini) return 0
  let total = fin - ini
  const a0 = hhmmAMinutos(almuerzo_inicio)
  const a1 = hhmmAMinutos(almuerzo_fin)
  if (a0 != null && a1 != null && a1 > a0) {
    const solapa0 = Math.max(ini, a0)
    const solapa1 = Math.min(fin, a1)
    if (solapa1 > solapa0) total -= (solapa1 - solapa0)
  }
  return Math.max(0, total) / 60
}

/**
 * Horas extra del día: trabajadas − jornada (si día no laborable, todas son extra).
 * Retorna número ≥ 0 redondeado a 2 decimales.
 */
export function calcularHorasExtra({
  hora_ingreso,
  hora_salida,
  horario,
  fechaISO,
} = {}) {
  const precarga = horasPrecargaDesdeHorario(horario, fechaISO)
  const trabajadas = horasTrabajadas({
    hora_ingreso,
    hora_salida,
    almuerzo_inicio: precarga.almuerzo_inicio,
    almuerzo_fin: precarga.almuerzo_fin,
  })
  const jornada = precarga.laborable ? precarga.horas_jornada : 0
  const extra = Math.max(0, trabajadas - jornada)
  return Math.round(extra * 100) / 100
}

export function formatoHorasDecimal(n) {
  const v = Number(n) || 0
  if (v <= 0) return '—'
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}
