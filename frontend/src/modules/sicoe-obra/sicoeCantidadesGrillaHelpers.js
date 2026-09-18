/**
 * Helpers de presentación — grilla «Por cantidades» (SicoeObra).
 * Tooltips, presencia de foto/gráfico y validación consolidada.
 */

export function registroTieneFoto(reg) {
  return !!String(reg?.foto_url || '').trim()
}

export function registroTieneGrafico(reg) {
  if (String(reg?.grafico_url || '').trim()) return true
  return Array.isArray(reg?.graficos_historial) && reg.graficos_historial.length > 0
}

/**
 * Mayor nivel (entre activos del contrato) cuyo estado es Aprobado.
 * @returns {number|null}
 */
export function nivelMaximoAprobado(reg, nivelesActivos = [1, 2, 3]) {
  const niveles = [...(nivelesActivos || [])]
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 6)
    .sort((a, b) => a - b)
  let max = null
  for (const n of niveles) {
    if (String(reg?.[`nivel${n}_estado`] || '').trim() === 'Aprobado') {
      max = n
    }
  }
  return max
}

/**
 * Etiqueta única: «Aprobado hasta N2» o «Sin aprobación».
 */
export function etiquetaValidacionConsolidada(reg, nivelesActivos = [1, 2, 3]) {
  const max = nivelMaximoAprobado(reg, nivelesActivos)
  if (max == null) return 'Sin aprobación'
  return `Aprobado hasta N${max}`
}

/** Texto completo para tooltip de ítem + descripción. */
export function textoItemDescripcion(reg) {
  const num = String(reg?.item_numero || '').trim()
  const desc = String(reg?.item_descripcion || '').trim()
  if (num && desc) return `${num} — ${desc}`
  return num || desc || '—'
}

/** Texto compacto visible (truncado vía CSS). */
export function textoItemCompacto(reg) {
  const num = String(reg?.item_numero || '').trim()
  const desc = String(reg?.item_descripcion || '').trim()
  if (num && desc) return `${num} · ${desc}`
  return num || desc || '—'
}

export function textoTramoTooltip(reg) {
  const tramo = String(reg?.tramo || '').trim()
  const infra = String(reg?.infraestructura || '').trim()
  if (tramo && infra) return `${tramo} · ${infra}`
  return tramo || infra || ''
}
