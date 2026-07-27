/** Colores de origen en bandeja — heredan el tema de plataforma vía contraste, no un skin propio. */
export const ORIGEN_COLOR = {
  compromiso: {
    bg: 'color-mix(in srgb, var(--cc-color-positive, #0f766e) 14%, transparent)',
    border: 'var(--cc-color-positive, #0f766e)',
    label: 'Compromiso de acta',
  },
  tarea: {
    bg: 'color-mix(in srgb, #2563eb 14%, transparent)',
    border: '#2563eb',
    label: 'Tarea personal',
  },
}

export const ESTADOS = [
  { value: '', label: 'Todos' },
  { value: 'abierto', label: 'Abierto' },
  { value: 'en_progreso', label: 'En progreso' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'reprogramado', label: 'Reprogramado' },
  { value: 'cumplido', label: 'Cumplido' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'cancelado', label: 'Cancelado' },
]

export const ACTA_ESTADOS = [
  { value: '', label: 'Todos' },
  { value: 'borrador', label: 'Borrador' },
  { value: 'realizada', label: 'Realizada' },
  { value: 'firmada', label: 'Firmada' },
]

export const ACTA_TIPOS = [
  { value: '', label: 'Todos' },
  { value: 'interna', label: 'Interna' },
  { value: 'externa', label: 'Externa' },
]

export function labelEstadoActa(estado) {
  const e = String(estado || '').toLowerCase()
  if (e === 'en_firma' || e === 'cerrada') return 'Realizada'
  return ACTA_ESTADOS.find((x) => x.value === e)?.label || estado || '—'
}

export function labelTipoActa(tipo) {
  const t = String(tipo || '').toLowerCase()
  return ACTA_TIPOS.find((x) => x.value === t)?.label || (tipo || '—')
}

export function numeroActaLabel(consecutivo) {
  if (consecutivo == null || consecutivo === '') return '—'
  return `Acta Nº ${consecutivo}`
}

export function fmtFecha(iso) {
  if (!iso) return '—'
  const s = String(iso).slice(0, 10)
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return s
  return `${d}/${m}/${y}`
}

export function fmtFechaHora(fecha, hora) {
  const f = fmtFecha(fecha)
  if (!hora) return f
  return `${f} ${String(hora).slice(0, 5)}`
}

/** Estados seleccionables en el detalle (sin opción vacía «Todos»). */
export const ESTADOS_GESTION = ESTADOS.filter((x) => x.value)
