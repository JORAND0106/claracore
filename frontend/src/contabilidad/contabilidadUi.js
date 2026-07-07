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

export const TAB_KEYS = ['transacciones', 'cuentas', 'cierre', 'reportes']

export const TAB_LABELS = {
  transacciones: 'Transacciones',
  cuentas: 'Cuentas especiales',
  cierre: 'Cierre mensual',
  reportes: 'Reportes',
}
