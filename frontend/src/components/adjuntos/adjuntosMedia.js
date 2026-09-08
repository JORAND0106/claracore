/** Slides unificados: foto + gráfico + esquema en el mismo carrusel. */

export function isEsquemaAdjunto(item) {
  const kind = String(item?.kind || '').toLowerCase()
  const origen = String(item?.origen || '').toLowerCase()
  return kind === 'esquema' || origen === 'esquema'
}

export function etiquetaAdjunto(item, fallback = 'Adjunto') {
  if (isEsquemaAdjunto(item)) {
    if (item?.numero != null) return `Esquema #${item.numero}`
    return item?.nombre || item?.label || 'Esquema'
  }
  if (item?.kind === 'foto' || item?.label === 'Foto') return item?.label || 'Foto'
  if (item?.numero != null) return `Gráfico #${item.numero}`
  return item?.nombre || item?.label || fallback
}

export function slidesFromRegistro(fotoUrl, graficos = []) {
  const items = []
  const foto = String(fotoUrl || '').trim()
  if (foto && foto !== 'null' && foto !== 'undefined') {
    items.push({ url: foto, label: 'Foto', kind: 'foto' })
  }
  for (const g of graficos || []) {
    if (!g?.url) continue
    const esquema = isEsquemaAdjunto(g)
    items.push({
      url: g.url,
      label: etiquetaAdjunto(g, esquema ? 'Esquema' : 'Gráfico'),
      kind: esquema ? 'esquema' : 'grafico',
      origen: g.origen || null,
      numero: g.numero ?? null,
      source: g,
    })
  }
  return items
}

export function slidesFromImagenes(imagenes, getUrl) {
  const items = []
  for (const im of imagenes || []) {
    const url = typeof getUrl === 'function'
      ? getUrl(im)
      : (im?.url || im?.previewUrl || im?.data_uri || im?.blob_url || null)
    if (!url && !im?.blob_path) continue
    const esquema = isEsquemaAdjunto(im)
    items.push({
      url,
      label: etiquetaAdjunto(im, esquema ? 'Esquema' : 'Foto'),
      kind: esquema ? 'esquema' : (im?.kind || 'foto'),
      origen: im?.origen || null,
      source: im,
    })
  }
  return items
}

export function slidesFromChecklistItem(item, srcFn) {
  const src = typeof srcFn === 'function'
    ? srcFn
    : (x) => x?.data_uri || x?.url || x?.blob_url || null
  const items = []
  const img = src(item?.imagen)
  if (img) items.push({ url: img, label: 'Foto', kind: 'foto', source: item.imagen })
  const esq = src(item?.esquema)
  if (esq) items.push({ url: esq, label: 'Esquema', kind: 'esquema', source: item.esquema })
  return items
}

export function evidenciaEsImagen(ev) {
  const mime = String(ev?.mime_type || ev?.tipo || '').toLowerCase()
  const name = String(ev?.nombre_archivo || ev?.nombre || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) return true
  return !!(ev?.data_uri || (ev?.url && /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(String(ev.url))))
}
