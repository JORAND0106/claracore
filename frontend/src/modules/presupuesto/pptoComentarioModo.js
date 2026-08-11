/** Modos al crear comentario/observación sobre registros con historial previo. */
export const PPTO_COMENTARIO_MODO_APPEND = 'append'
export const PPTO_COMENTARIO_MODO_REPLACE = 'replace'

const TIPOS_LABEL = {
  dims: 'dimensiones',
  item_capitulo: 'ítem / capítulo',
  validacion: 'validación',
  reapertura: 'reapertura',
  contratista_edita_interv: 'edición con interventoría',
}

export function pptoComentarioTipoLabel(tipo) {
  return TIPOS_LABEL[tipo] || 'comentario'
}

/**
 * Une observación nueva al texto previo (por registro).
 * @param {string} prev
 * @param {string} nuevo
 * @param {string} [sep]
 */
export function pptoConcatenarObservacion(prev, nuevo, sep = '\n') {
  const a = String(prev || '').trim()
  const b = String(nuevo || '').trim()
  if (!b) return a
  if (!a) return b
  return `${a}${sep}${b}`
}

/**
 * Cuántos ids de la selección tienen al menos un comentario raíz del tipo dado.
 * @param {Record<string|number, { count?: number }|number|null|undefined>} countsById
 * @param {Array<string|number>} ids
 */
export function pptoContarIdsConHistorial(countsById, ids) {
  if (!ids?.length) return 0
  let n = 0
  for (const id of ids) {
    const raw = countsById?.[id] ?? countsById?.[String(id)]
    const c = typeof raw === 'number' ? raw : Number(raw?.count || 0)
    if (c > 0) n += 1
  }
  return n
}

/**
 * Texto del modal de decisión agregar vs reemplazar.
 * @param {{ nConHistorial: number, nTotal: number, etiqueta?: string }} p
 */
export function pptoTextoModoHistorial({ nConHistorial, nTotal, etiqueta = 'comentarios' }) {
  const n = Math.max(0, Number(nConHistorial) || 0)
  const total = Math.max(n, Number(nTotal) || 0)
  if (total <= 1) {
    return `Este registro ya tiene ${etiqueta} previos. ¿Desea agregar el nuevo al historial o reemplazar los existentes dejando solo el nuevo?`
  }
  if (n >= total) {
    return `Los ${total} registros seleccionados ya tienen ${etiqueta} previos (pueden diferir entre sí). ¿Desea agregar el nuevo al historial de cada uno o reemplazar los existentes dejando solo el nuevo?`
  }
  return `${n} de ${total} registros seleccionados ya tienen ${etiqueta} previos. ¿Desea agregar el nuevo al historial (solo donde aplique) o reemplazar los existentes en todos los afectados dejando solo el nuevo?`
}
