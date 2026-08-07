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
