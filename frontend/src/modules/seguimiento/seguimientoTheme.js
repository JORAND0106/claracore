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
  { value: 'cumplido', label: 'Cumplido' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'cancelado', label: 'Cancelado' },
]

export function fmtFecha(iso) {
  if (!iso) return '—'
  const s = String(iso).slice(0, 10)
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return s
  return `${d}/${m}/${y}`
}
