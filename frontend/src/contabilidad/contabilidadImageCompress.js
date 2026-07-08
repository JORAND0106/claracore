/**
 * Comprime imágenes en el cliente antes de subir (máx. 800 KB por defecto).
 * PDF y otros formatos se devuelven sin cambios.
 */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

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

function scaledSize(w, h, maxDim = 1920) {
  if (w <= maxDim && h <= maxDim) return { w, h }
  const r = Math.min(maxDim / w, maxDim / h)
  return { w: Math.round(w * r), h: Math.round(h * r) }
}

/**
 * @param {File} file
 * @param {number} maxBytes
 * @returns {Promise<File>}
 */
export async function compressImageForSoporte(file, maxBytes = 800 * 1024) {
  if (!file || !IMAGE_TYPES.has((file.type || '').toLowerCase())) return file
  if (file.size <= maxBytes) return file

  const img = await loadImageFromFile(file)
  const { w, h } = scaledSize(img.naturalWidth || img.width, img.naturalHeight || img.height)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(img, 0, 0, w, h)

  const preferJpeg = file.type === 'image/jpeg' || file.type === 'image/webp'
  const outMime = preferJpeg ? 'image/jpeg' : 'image/png'
  const baseName = (file.name || 'soporte').replace(/\.[^.]+$/, '')

  let quality = 0.88
  let blob = await canvasToBlob(canvas, outMime, quality)
  while (blob && blob.size > maxBytes && quality > 0.35) {
    quality -= 0.08
    blob = await canvasToBlob(canvas, outMime, quality)
  }

  if (!blob || blob.size > maxBytes) {
    let dim = Math.min(w, h)
    while (blob && blob.size > maxBytes && dim > 480) {
      dim = Math.round(dim * 0.85)
      const ratio = dim / Math.max(w, h)
      const cw = Math.max(1, Math.round(w * ratio))
      const ch = Math.max(1, Math.round(h * ratio))
      canvas.width = cw
      canvas.height = ch
      ctx.drawImage(img, 0, 0, cw, ch)
      blob = await canvasToBlob(canvas, outMime, Math.max(0.5, quality))
    }
  }

  if (!blob) return file
  if (blob.size >= file.size) return file

  const ext = outMime === 'image/jpeg' ? '.jpg' : '.png'
  return new File([blob], `${baseName}${ext}`, { type: outMime, lastModified: Date.now() })
}

/**
 * Comprime (si aplica) y devuelve el archivo listo más pesos para mostrar al usuario.
 * @param {File} file
 * @param {number} [maxBytes]
 * @returns {Promise<{ file: File, originalBytes: number, compressedBytes: number, wasCompressed: boolean }>}
 */
export async function prepareSoporteConPeso(file, maxBytes = 800 * 1024) {
  const originalBytes = file?.size || 0
  const prepared = await compressImageForSoporte(file, maxBytes)
  const compressedBytes = prepared?.size || 0
  return {
    file: prepared || file,
    originalBytes,
    compressedBytes,
    wasCompressed: compressedBytes > 0 && compressedBytes < originalBytes,
  }
}
