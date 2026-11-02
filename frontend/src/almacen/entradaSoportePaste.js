/**
 * Pegar Ctrl+V / Cmd+V en soportes de Llegó material (Remisión / foto descargue).
 */

/** Extrae un File del evento paste (imagen o PDF). */
export function fileFromClipboardEvent(e) {
  const cd = e?.clipboardData
  if (!cd) return null
  const files = cd.files
  if (files && files.length) {
    const f = files[0]
    if (f && f.size > 0) return f
  }
  const items = cd.items
  if (!items || !items.length) return null
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i]
    if (it.kind !== 'file') continue
    const f = it.getAsFile?.()
    if (f && f.size > 0) return f
  }
  return null
}

export function validateSoportePaste(file, which) {
  if (!file) {
    return { ok: false, message: 'El portapapeles no tiene un archivo para pegar.' }
  }
  const type = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  const isPdf = type === 'application/pdf' || name.endsWith('.pdf')
  const isImage = type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)$/i.test(name)
  if (which === 'material') {
    if (isPdf || (!isImage && type)) {
      return { ok: false, message: 'La foto del descargue debe ser una imagen.' }
    }
    if (!isImage && !type) {
      return { ok: false, message: 'La foto del descargue debe ser una imagen.' }
    }
    return { ok: true }
  }
  // remision
  if (isPdf || isImage) return { ok: true }
  if (!type) {
    return { ok: false, message: 'La remisión debe ser imagen o PDF.' }
  }
  return { ok: false, message: 'La remisión debe ser imagen o PDF.' }
}

/**
 * Destino del pegado: zona enfocada, o la primera que falte.
 * @returns {{ which: 'remision'|'material', label: string, replaced: boolean }}
 */
export function resolvePasteTarget({ focusedKind, hasRemision, hasMaterial } = {}) {
  if (focusedKind === 'remision' || focusedKind === 'material') {
    return {
      which: focusedKind,
      label: focusedKind === 'remision' ? 'Remisión' : 'Foto del descargue',
      replaced: focusedKind === 'remision' ? Boolean(hasRemision) : Boolean(hasMaterial),
    }
  }
  if (!hasRemision) {
    return { which: 'remision', label: 'Remisión', replaced: false }
  }
  if (!hasMaterial) {
    return { which: 'material', label: 'Foto del descargue', replaced: false }
  }
  return { which: 'remision', label: 'Remisión', replaced: true }
}
