/**
 * Mismas reglas que el backend: el neto sale de la caja y un fondo en cero
 * no divide el porcentaje.
 */
export function dinero(valor) {
  if (valor == null || valor === '') return 0
  const n = Number(String(valor).replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}

export function valorNeto(partes) {
  return (
    dinero(partes?.bruto)
    + dinero(partes?.iva)
    + dinero(partes?.impuestoConsumo)
    - dinero(partes?.retenciones)
    - dinero(partes?.otros)
  )
}

export function indicadores(saldo, ingresos, gastos) {
  const consignaciones = (ingresos || []).reduce((s, i) => s + dinero(i.valor), 0)
  const fondo = dinero(saldo) + consignaciones
  const gastados = (gastos || [])
    .filter((g) => g?.estado_validacion !== 'rechazado')
    .reduce((s, g) => s + dinero(g.valor_neto), 0)
  const pct = fondo === 0 ? null : Math.round((gastados * 1000) / fondo) / 10
  return {
    saldo_trasladado: dinero(saldo),
    consignaciones,
    fondo_establecido: fondo,
    gastos_periodo: gastados,
    gasto_actual: pct,
    disponible: fondo - gastados,
  }
}

export function fmtPct(pct) {
  if (pct == null || Number.isNaN(Number(pct))) return '—'
  const n = Math.round(Number(pct) * 10) / 10
  return `${String(n).replace(/\.0$/, '')} %`
}

export function hoyColombia(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function normalizarDocumento(raw) {
  return String(raw || '').replace(/\D/g, '')
}

export const ETIQUETA_ESTADO = {
  abierta: 'Abierta',
  en_legalizacion: 'En legalización',
  legalizada: 'Legalizada',
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
}
