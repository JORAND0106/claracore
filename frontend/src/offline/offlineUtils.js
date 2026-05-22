/** Límite de blobs en cola antes de advertir al usuario. */
export const PENDING_BLOBS_WARN_LIMIT = 200

/**
 * Redimensiona y comprime una imagen a JPEG vía Canvas (offline / cola IndexedDB).
 * @param {File|Blob} file
 * @param {number} maxWidthPx
 * @param {number} calidadJpeg 0–1
 * @returns {Promise<Blob>}
 */
export async function comprimirImagenOffline(file, maxWidthPx = 1280, calidadJpeg = 0.75) {
  const bitmap = await createImageBitmap(file)
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

/** Muestra advertencia si la cola de blobs supera el límite. */
export async function warnPendingBlobsLimit(countPendingBlobs) {
  const n = typeof countPendingBlobs === 'function'
    ? await countPendingBlobs()
    : countPendingBlobs
  if (n >= PENDING_BLOBS_WARN_LIMIT) {
    alert(
      'Tienes muchas fotos en cola — sincroniza pronto para liberar espacio.',
    )
  }
}
