export function fmtCOP(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

export function fmtNum(n, dec = 2) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export function mesLabel(anio, mes) {
  const names = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${names[mes] || mes} ${anio}`
}

export const TAB_KEYS = ['transacciones', 'cuentas', 'cierre', 'reportes', 'documentos']

export const TAB_LABELS = {
  transacciones: 'Transacciones',
  cuentas: 'Cuentas especiales',
  cierre: 'Cierre mensual',
  reportes: 'Reportes',
  documentos: 'Documentos',
}

export const DOC_CATEGORIAS = [
  { value: 'legal', label: 'Legal' },
  { value: 'tributario', label: 'Tributario' },
  { value: 'corporativo', label: 'Corporativo' },
  { value: 'laboral', label: 'Laboral' },
  { value: 'otros', label: 'Otros' },
]

export function docCategoriaLabel(value) {
  return DOC_CATEGORIAS.find((c) => c.value === value)?.label || value || '—'
}

export function fmtFecha(iso) {
  if (!iso) return '—'
  const s = String(iso).slice(0, 10)
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return s
  return `${d}/${m}/${y}`
}

export function fmtBytes(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return '—'
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / (1024 * 1024)).toFixed(1)} MB`
}

export function diasHastaVencimiento(fechaVencimiento) {
  if (!fechaVencimiento) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const v = new Date(`${String(fechaVencimiento).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(v.getTime())) return null
  return Math.round((v - hoy) / (1000 * 60 * 60 * 24))
}

export function vencePronto(fechaVencimiento, diasAlerta = 30) {
  const d = diasHastaVencimiento(fechaVencimiento)
  return d != null && d >= 0 && d <= diasAlerta
}

export function vencido(fechaVencimiento) {
  const d = diasHastaVencimiento(fechaVencimiento)
  return d != null && d < 0
}
