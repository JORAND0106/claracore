/** True si hay contexto suficiente para consultar ítems (texto o acotadores opcionales). */
export function sicoeItemPickerPuedeBuscar({ q = '', acta_rpo = '', capitulo = '', semana = '' } = {}) {
  return Boolean(String(q || '').trim() || acta_rpo || capitulo || semana)
}

/** Query params del autocomplete de ítems (capítulo/acta/semana opcionales). */
export function sicoeItemsSugerenciasParams({ q, capitulo, acta_rpo, semana } = {}) {
  const params = new URLSearchParams()
  const qTrim = String(q || '').trim()
  if (qTrim) params.set('q', qTrim)
  if (capitulo) params.set('capitulo', String(capitulo))
  if (acta_rpo) params.set('acta_rpo', String(acta_rpo))
  if (semana) params.set('semana', String(semana))
  return params
}
