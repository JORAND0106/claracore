/** Helpers puros para la tabla de ítems/registros del reporte SicoeObra. */

export const PASTEL_ESTADO_VALIDACION = {
  Aprobado: { bg: '#dcfce7', border: '#86efac' },
  Pendiente: { bg: '#fef3c7', border: '#fcd34d' },
  Rechazado: { bg: '#fee2e2', border: '#fca5a5' },
  'No Objeto de Cobro': { bg: '#fee2e2', border: '#fca5a5' },
  'No Revisado': { bg: 'transparent', border: 'transparent' },
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
    const key = String(r?.item_numero || '').trim()
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
