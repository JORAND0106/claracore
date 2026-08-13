/**
 * Helpers de galería de gráficos de Presupuesto (grupos ya cargados).
 * Distinto de la galería de fotos de campo de SicoeObra.
 */

/**
 * Aplana imágenes de GET /presupuesto/{id}/graficos/grupos para el picker.
 * @param {Array<{ id?: string, pie_foto?: string, caption?: string, items?: string[], imagenes?: object[] }>} grupos
 */
export function aplanarImagenesGaleriaGraficos(grupos) {
  const out = []
  const seen = new Set()
  for (const g of Array.isArray(grupos) ? grupos : []) {
    const imgs = Array.isArray(g?.imagenes) ? g.imagenes : []
    const pie = String(g?.pie_foto || g?.caption || '').replace(/^—$/, '').trim()
    const itemsLabel = Array.isArray(g?.items) ? g.items.filter(Boolean).join(', ') : ''
    for (const im of imgs) {
      const url = String(im?.url || '').trim()
      if (!url) continue
      const key = `${im?.id ?? ''}|${url}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        id: im?.id ?? key,
        url,
        blob_path: im?.blob_path || null,
        origen: im?.origen || 'galeria',
        descripcion: String(im?.descripcion || pie || '').trim(),
        grupo_id: g?.id ?? null,
        pie_foto: pie,
        items_label: itemsLabel,
      })
    }
  }
  return out
}
