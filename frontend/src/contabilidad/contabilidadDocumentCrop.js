/**
 * Recorte de documento usando bounding box normalizado (0–1) de Azure DI.
 * Fallback silencioso a la imagen original.
 */

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), mime, quality)
  })
}

/**
 * @param {File} file
 * @param {{ x: number, y: number, w: number, h: number } | null | undefined} crop  coords normalizadas 0–1
 * @returns {Promise<File>}
 */
export async function cropImageWithNormalizedBox(file, crop) {
  try {
    if (!file || !crop) return file
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type || '')) return file
    const { x, y, w, h } = crop
    if (![x, y, w, h].every((n) => Number.isFinite(n) && n >= 0)) return file
    if (w < 0.1 || h < 0.1 || w > 0.99 || h > 0.99) return file
    if (x + w > 1.02 || y + h > 1.02) return file

    const img = await loadImageFromFile(file)
    const ow = img.naturalWidth || img.width
    const oh = img.naturalHeight || img.height
    if (!ow || !oh) return file

    const sx = Math.max(0, Math.floor(x * ow))
    const sy = Math.max(0, Math.floor(y * oh))
    const sw = Math.min(ow - sx, Math.ceil(w * ow))
    const sh = Math.min(oh - sy, Math.ceil(h * oh))
    if (sw < 40 || sh < 40) return file
    if (sw * sh >= ow * oh * 0.97) return file

    const out = document.createElement('canvas')
    out.width = sw
    out.height = sh
    const ctx = out.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await canvasToBlob(out, mime, 0.92)
    if (!blob || blob.size < 100) return file

    const base = (file.name || 'soporte').replace(/\.[^.]+$/, '')
    const ext = mime === 'image/png' ? '.png' : '.jpg'
    return new File([blob], `${base}_doc${ext}`, { type: mime, lastModified: Date.now() })
  } catch {
    return file
  }
}

/** @deprecated Prefer cropImageWithNormalizedBox con bbox de Azure. */
export async function cropDocumentFromImage(file) {
  return file
}
