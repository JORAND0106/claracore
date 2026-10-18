/** Slides unificados: foto + gráfico + esquema + memoria de cálculo en el mismo carrusel. */

export function isEsquemaAdjunto(item) {
  const kind = String(item?.kind || '').toLowerCase()
  const origen = String(item?.origen || '').toLowerCase()
  return kind === 'esquema' || origen === 'esquema'
}

/** Adjunto generado por el cálculo 3D (PDF memoria o PNG isométrico). */
export function isEsquemaCalcAdjunto(item) {
  const kind = String(item?.kind || item?.source?.kind || '').toLowerCase()
  const origen = String(item?.origen || item?.source?.origen || '').toLowerCase()
  if (origen === 'esquema-calculo') return true
  return kind === 'memoria-calculo' || kind === 'grafico-isometrico' || kind === 'esquema-calculo' || kind === 'despiece-acero'
}

export function isPdfAdjunto(item) {
  const mime = String(item?.mime || item?.mime_type || item?.tipo || item?.source?.mime || item?.source?.mime_type || '').toLowerCase()
  const name = String(item?.nombre || item?.nombre_archivo || item?.name || item?.label || item?.source?.nombre || '').toLowerCase()
  const kind = String(item?.kind || item?.source?.kind || '').toLowerCase()
  const url = String(item?.url || item?.previewUrl || item?.data_uri || item?.dataUri || item?.source?.url || '')
  // Memoria / despiece PNG: no tratarlos como PDF por el kind.
  if (kind === 'memoria-calculo' || kind === 'despiece-acero') {
    if (mime.startsWith('image/') || /\.png(\?|$)/i.test(name) || /^data:image\//i.test(url) || /\.png(\?|$)/i.test(url)) {
      return false
    }
    if (mime.includes('pdf') || /\.pdf(\?|$)/i.test(name) || /^data:application\/pdf/i.test(url) || /\.pdf(\?|$)/i.test(url)) {
      return true
    }
    // Por defecto (sin mime claro): PNG de memoria actual.
    return false
  }
  if (mime.includes('pdf')) return true
  if (/\.pdf(\?|$)/i.test(name)) return true
  if (/\.pdf(\?|$)/i.test(url)) return true
  return false
}

export function etiquetaAdjunto(item, fallback = 'Adjunto') {
  if (isEsquemaCalcAdjunto(item)) {
    const kind = String(item?.kind || item?.source?.kind || '').toLowerCase()
    if (kind === 'despiece-acero') {
      return item?.nombre || item?.label || 'Cuadro de despiece'
    }
    if (kind === 'memoria-calculo' || isPdfAdjunto(item)) {
      return item?.nombre || item?.label || 'Memoria de cálculo'
    }
    if (kind === 'grafico-isometrico') {
      return item?.nombre || item?.label || 'Gráfico isométrico'
    }
    return item?.nombre || item?.label || 'Cálculo de volúmenes'
  }
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
    const calc = isEsquemaCalcAdjunto(g)
    const pdf = isPdfAdjunto(g)
    const esquema = isEsquemaAdjunto(g)
    let kind = 'grafico'
    if (calc) {
      kind = g.kind || (pdf ? 'memoria-calculo' : 'grafico-isometrico')
    } else if (pdf) {
      kind = 'memoria-calculo'
    } else if (esquema) {
      kind = 'esquema'
    }
    items.push({
      url: g.url,
      label: etiquetaAdjunto(g, calc ? 'Cálculo' : (esquema ? 'Esquema' : 'Gráfico')),
      kind,
      origen: g.origen || null,
      mime: g.mime || g.mime_type || null,
      nombre: g.nombre || g.nombre_archivo || null,
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
    if (!url && !im?.blob_path && !im?.file) continue
    const calc = isEsquemaCalcAdjunto(im)
    const esquema = isEsquemaAdjunto(im)
    const pdf = isPdfAdjunto(im)
    items.push({
      url: url || (im?.file ? URL.createObjectURL(im.file) : null),
      label: etiquetaAdjunto(im, calc ? 'Cálculo' : (esquema ? 'Esquema' : 'Foto')),
      kind: calc
        ? (im?.kind || (pdf ? 'memoria-calculo' : 'grafico-isometrico'))
        : (esquema ? 'esquema' : (im?.kind || 'foto')),
      origen: im?.origen || null,
      mime: im?.mime || im?.mime_type || im?.file?.type || null,
      nombre: im?.nombre || im?.nombre_archivo || im?.file?.name || null,
      numero: im?.numero ?? null,
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
  for (const adj of item?.esquema_calc_adjuntos || []) {
    const u = src(adj)
    if (!u) continue
    items.push({
      url: u,
      label: etiquetaAdjunto(adj, 'Cálculo'),
      kind: adj?.kind || (isPdfAdjunto(adj) ? 'memoria-calculo' : 'grafico-isometrico'),
      origen: adj?.origen || 'esquema-calculo',
      mime: adj?.mime || adj?.mime_type || null,
      nombre: adj?.nombre || null,
      source: adj,
    })
  }
  return items
}

export function evidenciaEsImagen(ev) {
  if (isPdfAdjunto(ev)) return false
  const mime = String(ev?.mime_type || ev?.tipo || '').toLowerCase()
  const name = String(ev?.nombre_archivo || ev?.nombre || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) return true
  return !!(ev?.data_uri || (ev?.url && /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(String(ev.url))))
}

/** Incluye imágenes y PDFs de memoria de cálculo en el carrusel. */
export function evidenciaEsMediaCarrusel(ev) {
  return evidenciaEsImagen(ev) || isEsquemaCalcAdjunto(ev) || isPdfAdjunto(ev)
}
