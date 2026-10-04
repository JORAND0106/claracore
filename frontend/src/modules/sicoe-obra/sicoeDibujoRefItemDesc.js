/**
 * Resuelve descripciones de ítems para tooltips del panel de referencia.
 * @param {{ items_detalle?: Array, registros?: Array }|null|undefined} refInfo
 * @returns {Record<string, string>}
 */
export function descByItemFromRef(refInfo) {
  const detalle = Array.isArray(refInfo?.items_detalle) ? refInfo.items_detalle : []
  const descByItem = {}
  for (const d of detalle) {
    const num = String(d?.item_numero || '').trim()
    if (!num) continue
    const desc = String(d?.item_descripcion || '').trim()
    if (desc && !descByItem[num]) descByItem[num] = desc
  }
  for (const reg of Array.isArray(refInfo?.registros) ? refInfo.registros : []) {
    const num = String(reg?.item_numero || '').trim()
    if (!num || descByItem[num]) continue
    const desc = String(reg?.item_descripcion || '').trim()
    if (desc) descByItem[num] = desc
  }
  return descByItem
}
