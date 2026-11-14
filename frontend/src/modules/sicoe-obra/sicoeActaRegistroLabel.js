/**
 * Etiqueta visible del Acta RPO de un registro (línea), no solo tooltip.
 * Preferir acta_rpo_numero del registro; si falta, resolver por id en actasList.
 */
export function sicoeLabelActaRpoRegistro(registro, { actasList = [] } = {}) {
  const numDirecto = registro?.acta_rpo_numero
  if (numDirecto != null && String(numDirecto).trim() !== '') {
    return `Acta RPO ${numDirecto}`
  }
  const aid = registro?.acta_rpo_id
  if (aid == null || aid === '') return 'Sin acta'
  const hit = (Array.isArray(actasList) ? actasList : []).find(
    (a) => String(a?.id) === String(aid),
  )
  if (hit?.numero_rpo != null && String(hit.numero_rpo).trim() !== '') {
    return `Acta RPO ${hit.numero_rpo}`
  }
  // Tiene acta asignada pero aún no resolvimos el número (p. ej. listado vacío).
  return `Acta RPO ${aid}`
}

/** Texto corto para columna de listado (p. ej. "75" o "—"). */
export function sicoeActaRpoNumeroCorto(registro, { actasList = [] } = {}) {
  const label = sicoeLabelActaRpoRegistro(registro, { actasList })
  if (label === 'Sin acta') return '—'
  const m = String(label).match(/Acta RPO\s+(.+)$/i)
  return m ? m[1] : '—'
}
