/** Helpers puros para la tabla de ítems/registros del reporte SicoeObra. */

export const PASTEL_ESTADO_VALIDACION = {
  Aprobado: { bg: '#dcfce7', border: '#86efac', color: '#166534' },
  Pendiente: { bg: '#fef3c7', border: '#fcd34d', color: '#92400e' },
  Rechazado: { bg: '#fee2e2', border: '#fca5a5', color: '#991b1b' },
  'No Objeto de Cobro': { bg: '#fee2e2', border: '#fca5a5', color: '#991b1b' },
  'No Revisado': { bg: 'transparent', border: 'transparent', color: null },
}

/**
 * Clave de expansión de ítem: siempre string trim.
 * Evita que `itemExpandido === fila.itemNum` falle cuando el panel/_autoRegistro
 * escribe el `item_numero` crudo (espacios, número) y la tabla agrupa con String().trim().
 */
export function normalizarItemNumSicoe(v) {
  const s = String(v ?? '').trim()
  return s || null
}

export function sortItemKeysSicoe(keys) {
  return [...keys].sort((a, b) =>
    String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' }),
  )
}

/** Agrupa registros por item_numero y calcula sumas de cantidad/costo. */
export function agruparRegistrosPorItem(registros) {
  const map = new Map()
  for (const r of registros || []) {
    const key = normalizarItemNumSicoe(r?.item_numero)
    if (!key) continue
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  }
  return sortItemKeysSicoe([...map.keys()]).map((itemNum) => {
    const regs = [...(map.get(itemNum) || [])].sort(
      (a, b) => (Number(a.numero_registro) || 0) - (Number(b.numero_registro) || 0),
    )
    const ref = regs[0] || {}
    const sumCant = regs.reduce((acc, r) => acc + (Number(r.cantidad_total) || 0), 0)
    const sumCd = regs.reduce((acc, r) => acc + (Number(r.costo_directo) || 0), 0)
    return {
      itemNum,
      descripcion: String(ref.item_descripcion || '').trim() || '—',
      unidad: String(ref.unidad || '').trim() || '—',
      sumCant,
      sumCd,
      regs,
    }
  })
}

/**
 * ¿El ítem aparece expandido? Compara con la misma normalización que el agrupado.
 * Independiente del zoom del navegador (solo igualdad de claves).
 */
export function sicoeItemFilaAbierta(itemExpandido, itemNum) {
  const a = normalizarItemNumSicoe(itemExpandido)
  const b = normalizarItemNumSicoe(itemNum)
  return !!(a && b && a === b)
}

/** Columnas de la fila de ítem (outer table). */
export function sicoeItemsOuterColCount(verValoresEconomicos) {
  return verValoresEconomicos ? 6 : 5
}

/** Columnas de la subtabla de registros (checkbox…acciones). */
export function sicoeItemsSubColCount(verValoresEconomicos) {
  return verValoresEconomicos ? 12 : 11
}

/** Estado de validación del nivel del usuario (no consolidado). */
export function estadoNivelUsuarioRegistro(reg, nivelValidacion) {
  const nv = Number(nivelValidacion)
  if (!nv || nv < 1 || nv > 6) return reg?.sub_estado || 'No Revisado'
  return reg?.[`nivel${nv}_estado`] || 'No Revisado'
}

/** Estado de un nivel concreto (1–6) o subcontratista. */
export function estadoNivelRegistro(reg, nivelNum) {
  const nv = Number(nivelNum)
  if (!nv || nv < 1 || nv > 6) return reg?.sub_estado || 'No Revisado'
  return reg?.[`nivel${nv}_estado`] || 'No Revisado'
}

/**
 * Etiqueta corta de rol a partir del encabezado del contrato.
 * Ej: "Nivel 2 · Contratista" → "Contratista"; "Director de obra (N3)" → "Director de obra".
 */
export function etiquetaCortaRolNivel(encabezado, nivelNum) {
  const n = Number(nivelNum)
  let s = String(encabezado || '').trim()
  if (!s) return n ? `N${n}` : '—'
  s = s.replace(new RegExp(`\\s*\\(N${n}\\)\\s*$`, 'i'), '').trim()
  const parts = s.split(/\s*[·•|]\s*/)
  if (parts.length >= 2) {
    const tail = parts.slice(1).join(' · ').trim()
    if (tail) return tail
  }
  s = s.replace(new RegExp(`^Nivel\\s*${n}\\s*`, 'i'), '').trim()
  return s || (n ? `N${n}` : '—')
}

export function pastelDeEstadoValidacion(estado) {
  return PASTEL_ESTADO_VALIDACION[estado] || PASTEL_ESTADO_VALIDACION['No Revisado']
}

/** Normaliza estado de nivel para conteos (agrupa No Objeto de Cobro → Rechazado). */
export function normalizarEstadoParaConteo(estadoRaw) {
  let est = estadoRaw || 'No Revisado'
  if (est === 'No Objeto de Cobro') est = 'Rechazado'
  if (!['Aprobado', 'Pendiente', 'Rechazado', 'No Revisado'].includes(est)) return 'No Revisado'
  return est
}

/**
 * Cuenta registros por estado del nivel del usuario (solo entre `regs`).
 * @param {object[]} regs
 * @param {(reg) => string} estadoMiNivel
 */
export function conteoEstadosPorNivel(regs, estadoMiNivel) {
  const conteo = { Aprobado: 0, Pendiente: 0, Rechazado: 0, 'No Revisado': 0 }
  for (const r of regs || []) {
    const est = normalizarEstadoParaConteo(estadoMiNivel?.(r) || 'No Revisado')
    conteo[est] = (conteo[est] || 0) + 1
  }
  return conteo
}

/** IDs de registros cuyo estado (nivel usuario) coincide con `estadoFiltro`. */
export function idsRegistrosEnEstado(regs, estadoMiNivel, estadoFiltro) {
  const target = normalizarEstadoParaConteo(estadoFiltro)
  return (regs || [])
    .filter((r) => normalizarEstadoParaConteo(estadoMiNivel?.(r) || 'No Revisado') === target)
    .map((r) => r.id)
    .filter((id) => id != null)
}

/** Suma de costo_directo de filas de ítem (ya agregadas). */
export function sumatoriaCostoDirectoFilasItem(filasItem) {
  return (filasItem || []).reduce((acc, f) => acc + (Number(f.sumCd) || 0), 0)
}

/** Suma de cantidad_total de filas de ítem. */
export function sumatoriaCantidadFilasItem(filasItem) {
  return (filasItem || []).reduce((acc, f) => acc + (Number(f.sumCant) || 0), 0)
}

/** Roles operativos no usan validación masiva (ítem ni global). */
export function puedeValidacionMasivaPorRol({ puedeValidar, esOperativoContratista, esOperativoInterventoria }) {
  return !!puedeValidar && !esOperativoContratista && !esOperativoInterventoria
}
