import { comprimirImagen as comprimirImagenCore } from '../comprimirImagen'

/** Límite de blobs en cola antes de advertir al usuario. */
export const PENDING_BLOBS_WARN_LIMIT = 200

/**
 * @deprecated Usar `comprimirImagen` desde `../comprimirImagen.js`.
 * Alias conservado para cola offline.
 */
export async function comprimirImagenOffline(file, maxWidthPx = 1280, calidadJpeg = 0.75) {
  return comprimirImagenCore(file, { maxWidthPx, calidadJpeg })
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
