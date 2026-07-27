/** Utilidades de imagen para checklist de tareas (evitar página en blanco con data URIs). */

export function imagenSrc(im) {
  if (!im) return null
  return im.data_uri || im.url || im.blob_url || null
}

function dataUriToBlob(dataUri) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(String(dataUri || ''))
  if (!m) return null
  const mime = m[1] || 'image/png'
  const bin = atob(m[2])
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i += 1) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/**
 * Abre la imagen en pestaña nueva.
 * data: URIs largas fallan con window.open → se convierten a blob URL.
 */
export function openImageInNewTab(im) {
  const src = imagenSrc(im)
  if (!src) return false
  try {
    if (String(src).startsWith('data:')) {
      const blob = dataUriToBlob(src)
      if (!blob) return false
      const url = URL.createObjectURL(blob)
      const w = window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 120000)
      return !!w
    }
    const w = window.open(src, '_blank', 'noopener,noreferrer')
    return !!w
  } catch {
    return false
  }
}
