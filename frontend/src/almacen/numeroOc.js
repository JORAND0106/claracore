/** Número de OC que ve el usuario. Nunca el id interno de la base. */

export function numeroOcVisible(fila, ordenes) {
  const directo = fila?.numero_oc
  if (directo != null && String(directo).trim() !== '') return String(directo)
  const id = fila?.orden_compra_id ?? fila?.id
  const match = (ordenes || []).find((oc) => id != null && String(oc?.id) === String(id))
  if (match?.numero_oc != null && String(match.numero_oc).trim() !== '') return String(match.numero_oc)
  return ''
}

export function etiquetaOcVisible(fila, ordenes) {
  const num = numeroOcVisible(fila, ordenes)
  return num ? `OC #${num}` : 'La orden de compra'
}
