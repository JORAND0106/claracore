/**
 * Extrae el primer archivo de imagen del evento paste / clipboardData.
 * @param {ClipboardEvent|{ clipboardData?: DataTransfer }} e
 * @returns {File|null}
 */
export function imagenDesdePasteEvent(e) {
  const items = e?.clipboardData?.items
  if (!items?.length) return null
  for (const item of items) {
    if (item.type?.startsWith('image/')) {
      const file = item.getAsFile()
      if (!file) return null
      return new File(
        [file],
        file.name || `captura-${Date.now()}.png`,
        { type: file.type || 'image/png' },
      )
    }
  }
  return null
}

/**
 * Lee una imagen del portapapeles vía Clipboard API (clic en «Ctrl+V»).
 * @returns {Promise<File|null>} null si no hay imagen; lanza si el navegador deniega o no soporta.
 */
export async function imagenDesdeClipboard() {
  const clipApi = typeof navigator !== 'undefined' ? navigator.clipboard : null
  if (!clipApi?.read) {
    const err = new Error('clipboard-read-unsupported')
    err.code = 'clipboard-read-unsupported'
    throw err
  }
  const clip = await clipApi.read()
  for (const item of clip) {
    for (const ty of item.types || []) {
      if (!String(ty).startsWith('image/')) continue
      const blob = await item.getType(ty)
      const ext = ty.includes('png')
        ? 'png'
        : (ty.includes('jpeg') || ty.includes('jpg') ? 'jpg' : 'png')
      return new File(
        [blob],
        `captura-${Date.now()}.${ext}`,
        { type: blob.type || ty || 'image/png' },
      )
    }
  }
  return null
}
