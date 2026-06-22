/** Parámetros por defecto: balance calidad / peso para campo y móvil. */
export const COMPRIMIR_IMAGEN_DEFAULTS = {
  maxWidthPx: 1280,
  calidadJpeg: 0.75,
}

const EXT_IMAGEN = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i

/** @param {File|Blob|null|undefined} file */
export function esArchivoImagen(file) {
  if (!file) return false
  const type = file.type || ''
  if (type.startsWith('image/')) return true
  const name = file.name || ''
  return EXT_IMAGEN.test(name)
}

/**
 * Redimensiona (si aplica) y comprime a JPEG vía Canvas.
 * @param {File|Blob} file
 * @param {{ maxWidthPx?: number, calidadJpeg?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function comprimirImagen(file, opts = {}) {
  const maxWidthPx = opts.maxWidthPx ?? COMPRIMIR_IMAGEN_DEFAULTS.maxWidthPx
  const calidadJpeg = opts.calidadJpeg ?? COMPRIMIR_IMAGEN_DEFAULTS.calidadJpeg

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch (err) {
    console.warn('[comprimirImagen] No se pudo decodificar; se sube el original.', err)
    if (file instanceof Blob) return file
    return new Blob([file], { type: file.type || 'application/octet-stream' })
  }

  try {
    let { width, height } = bitmap
    if (width > maxWidthPx) {
      height = Math.round((height * maxWidthPx) / width)
      width = maxWidthPx
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen'))),
        'image/jpeg',
        calidadJpeg,
      )
    })
    return blob
  } finally {
    bitmap.close()
  }
}

/**
 * @param {File|Blob} file
 * @param {{ maxWidthPx?: number, calidadJpeg?: number, nombre?: string }} [opts]
 * @returns {Promise<File>}
 */
export async function prepararImagenParaUpload(file, opts = {}) {
  if (!esArchivoImagen(file)) return /** @type {File} */ (file)
  const blob = await comprimirImagen(file, opts)
  const rawName = opts.nombre || file.name || 'imagen'
  const base = rawName.replace(/\.[^.]+$/, '') || 'imagen'
  return new File([blob], `${base}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

/**
 * @param {File|Blob} file
 * @param {{ maxWidthPx?: number, calidadJpeg?: number }} [opts]
 * @returns {Promise<string>} data URL (image/jpeg)
 */
export async function comprimirImagenADataUrl(file, opts = {}) {
  const blob = await comprimirImagen(file, opts)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen comprimida'))
    reader.readAsDataURL(blob)
  })
}

/** @param {string} dataUrl */
export function base64DesdeDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return ''
  const i = dataUrl.indexOf(',')
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl
}
