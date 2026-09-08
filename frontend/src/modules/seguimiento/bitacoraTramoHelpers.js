/**
 * Helpers de segmentación del Reporte Diario por Tramo.
 */

/** Etiqueta UI para tramo ausente (legado / migrado sin dato real). */
export const TRAMO_NO_ESPECIFICADO_LABEL = 'Sin tramo asignado'
/** Alias explícito del mismo estado. */
export const SIN_TRAMO_ASIGNADO_LABEL = TRAMO_NO_ESPECIFICADO_LABEL

/**
 * ¿Es un sentinel inválido tipo «Tramo 0» / «0»?
 * El listado real de tramos de un contrato empieza en Tramo 1; nunca existe Tramo 0.
 */
export function isTramoSentinelInvalido(tramo) {
  const s = String(tramo ?? '').trim()
  if (!s) return false
  if (/^0+$/.test(s)) return true
  // «Tramo 0», «TRAMO 0», «tramo_0», «Tramo0» — no «Tramo 10» ni «10»
  if (/^tramo[\s_-]*0+$/i.test(s)) return true
  return false
}

/** Normaliza valor de tramo para comparar/guardar (trim; vacío o Tramo 0 → null). */
export function normalizeTramoValue(tramo) {
  const s = String(tramo ?? '').trim()
  if (!s || isTramoSentinelInvalido(s)) return null
  return s
}

/** Etiqueta visible del tramo (nunca vacía). */
export function labelTramoBitacora(tramo) {
  const n = normalizeTramoValue(tramo)
  return n || SIN_TRAMO_ASIGNADO_LABEL
}

/** ¿Hay al menos un diario diligenciado ese día? */
export function diariosDeFecha(diarios, fecha) {
  const f = String(fecha || '').slice(0, 10)
  return (Array.isArray(diarios) ? diarios : []).filter(
    (d) => String(d?.tipo || 'diario') !== 'evento'
      && String(d?.fecha || '').slice(0, 10) === f,
  )
}

/**
 * Agrupa filas de bitácora por fecha (YYYY-MM-DD).
 * @returns {Map<string, object[]>}
 */
export function groupDiariosByFecha(bitacoraRows = []) {
  const map = new Map()
  for (const row of bitacoraRows || []) {
    if (!row?.id) continue
    if (String(row.tipo || '') === 'evento') continue
    const f = String(row.fecha || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) continue
    if (!map.has(f)) map.set(f, [])
    map.get(f).push(row)
  }
  for (const [, list] of map) {
    list.sort((a, b) => {
      const ta = labelTramoBitacora(a.tramo).localeCompare(labelTramoBitacora(b.tramo), 'es')
      if (ta !== 0) return ta
      return Number(a.id || 0) - Number(b.id || 0)
    })
  }
  return map
}

/** Tramos ya usados en una lista de diarios (valores normalizados; null = no especificado). */
export function tramosOcupadosEnDiarios(diarios = []) {
  const set = new Set()
  for (const d of diarios || []) {
    set.add(normalizeTramoValue(d?.tramo) ?? '')
  }
  return set
}

/**
 * Opciones de tramo disponibles para crear un nuevo diario ese día.
 * @param {string[]} catalogo lista del maestro PK
 * @param {object[]} diariosExistentes
 */
export function tramosDisponiblesParaNuevo(catalogo = [], diariosExistentes = []) {
  const ocupados = tramosOcupadosEnDiarios(diariosExistentes)
  const opts = []
  const seen = new Set()
  for (const raw of catalogo || []) {
    const n = normalizeTramoValue(raw)
    if (!n || seen.has(n)) continue
    seen.add(n)
    if (ocupados.has(n)) continue
    opts.push(n)
  }
  return opts
}
