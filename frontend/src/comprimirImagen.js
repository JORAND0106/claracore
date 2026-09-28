/** Parámetros por defecto: balance calidad / peso para campo y móvil. */
export const COMPRIMIR_IMAGEN_DEFAULTS = {
  maxWidthPx: 1280,
  calidadJpeg: 0.75,
}

/**
 * Esquemas PNG: preservar formato y resolución alta (tabla de coordenadas legible
 * en memorias). Solo se redimensiona si supera el tope (evita PNG absurdos).
 */
export const COMPRIMIR_ESQUEMA_OPTS = {
  maxWidthPx: 3200,
  preservarPng: true,
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

function isPngFile(file) {
  const type = (file?.type || '').toLowerCase()
  if (type === 'image/png') return true
  const name = file?.name || ''
  return /\.png$/i.test(name)
}

/**
 * Redimensiona (si aplica) y comprime a JPEG vía Canvas.
 * Con `preservarPng: true` y entrada PNG, mantiene PNG (sin pasar a JPEG).
 * @param {File|Blob} file
 * @param {{ maxWidthPx?: number, calidadJpeg?: number, preservarPng?: boolean }} [opts]
 * @returns {Promise<Blob>}
 */
export async function comprimirImagen(file, opts = {}) {
  const maxWidthPx = opts.maxWidthPx ?? COMPRIMIR_IMAGEN_DEFAULTS.maxWidthPx
  const calidadJpeg = opts.calidadJpeg ?? COMPRIMIR_IMAGEN_DEFAULTS.calidadJpeg
  const preservarPng = !!opts.preservarPng && isPngFile(file)

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
    const needsResize = width > maxWidthPx
    if (preservarPng && !needsResize) {
      // PNG del esquema ya en rango: no re-encodear (evita pérdida/peso extra).
      if (file instanceof Blob) return file
      return new Blob([file], { type: 'image/png' })
    }
    if (needsResize) {
      height = Math.round((height * maxWidthPx) / width)
      width = maxWidthPx
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')
    ctx.drawImage(bitmap, 0, 0, width, height)
    const mime = preservarPng ? 'image/png' : 'image/jpeg'
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen'))),
        mime,
        preservarPng ? undefined : calidadJpeg,
      )
    })
    return blob
  } finally {
    bitmap.close()
  }
}

/**
 * @param {File|Blob} file
 * @param {{ maxWidthPx?: number, calidadJpeg?: number, nombre?: string, preservarPng?: boolean }} [opts]
 * @returns {Promise<File>}
 */
export async function prepararImagenParaUpload(file, opts = {}) {
  if (!esArchivoImagen(file)) return /** @type {File} */ (file)
  const blob = await comprimirImagen(file, opts)
  const rawName = opts.nombre || file.name || 'imagen'
  const base = rawName.replace(/\.[^.]+$/, '') || 'imagen'
  const preservarPng = !!opts.preservarPng && isPngFile(file)
  const ext = preservarPng ? 'png' : 'jpg'
  const type = preservarPng ? 'image/png' : 'image/jpeg'
  return new File([blob], `${base}.${ext}`, {
    type,
    lastModified: Date.now(),
  })
}

/**
 * Atajo: preparar un PNG de esquema sin degradarlo a JPEG 1280.
 * @param {File|Blob} file
 * @param {{ nombre?: string }} [opts]
 */
export async function prepararEsquemaParaUpload(file, opts = {}) {
  return prepararImagenParaUpload(file, {
    ...COMPRIMIR_ESQUEMA_OPTS,
    nombre: opts.nombre,
  })
}

/**
 * @param {File|Blob} file
 * @param {{ maxWidthPx?: number, calidadJpeg?: number, preservarPng?: boolean }} [opts]
 * @returns {Promise<string>} data URL
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

/**
 * SHA-256 hex del contenido (para deduplicar fotos SICOE).
 * @param {Blob|ArrayBuffer|File} data
 * @returns {Promise<string>}
 */
export async function sha256Hex(data) {
  const buf = data instanceof ArrayBuffer
    ? data
    : await (data instanceof Blob ? data.arrayBuffer() : new Response(data).arrayBuffer())
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}
