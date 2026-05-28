/** Utilidades para listado e historial de versiones — Programación de obra */

export function parseVersionesResponse(data) {
  if (Array.isArray(data)) {
    return { versiones: data, version_vigente_id: null, version_baseline_id: null }
  }
  return {
    versiones: Array.isArray(data?.versiones) ? data.versiones : [],
    version_vigente_id: data?.version_vigente_id ?? null,
    version_baseline_id: data?.version_baseline_id ?? null,
  }
}

export function progVersionMotivo(v) {
  const m = String(v?.motivo_reprogramacion || '').trim()
  if (m) return m
  if ((v?.tipo || '') === 'baseline') return 'Programación inicial'
  return '—'
}

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** Fecha corta tipo 01/Nov/2025 para historial. */
export function fmtDateHistorial(iso) {
  if (!iso) return null
  const str = String(iso).trim()
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const day = m[3]
  const month = MESES_CORTO[Number(m[2]) - 1] || m[2]
  return `${day}/${month}/${m[1]}`
}

export function progVersionFechaLinea(v) {
  const est = (v?.estado || '').toLowerCase()
  if (est === 'sellada' || est === 'archivada') {
    return fmtDateHistorial(v?.sellado_en)
  }
  return null
}

export function progVersionSelladoTooltip(v) {
  const nombre = String(v?.sellado_por_nombre || '').trim()
  if (!nombre) return null
  return `Sellada por ${nombre}`
}
