/**
 * Pegar soportes de Llegó material (iPad Safari + teclado + botón Pegar).
 *
 * Diagnóstico (código previo a este cambio):
 * - Solo había onPaste en el overlay/dialog + hint «Ctrl+V».
 * - Ningún recuadro contentEditable/enfocable recibía el menú «Pegar» de iOS.
 * - No había botón que llamara a navigator.clipboard.read().
 * En iPad sin teclado externo el pegado del sistema no tenía destino usable.
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
  // Algunos Safari entregan image/png como blob en items sin kind=file estable.
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i]
    const type = (it.type || '').toLowerCase()
    if (!type.startsWith('image/') && type !== 'application/pdf') continue
    const f = it.getAsFile?.()
    if (f && f.size > 0) return f
  }
  return null
}

/**
 * Lee el portapapeles con la Clipboard API (botón Pegar; gesto de usuario).
 * Safari iPad puede pedir confirmación.
 * @returns {Promise<{ ok: true, file: File } | { ok: false, message: string }>}
 */
export async function fileFromClipboardApi() {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return {
      ok: false,
      message: 'Este navegador no permite leer el portapapeles. Use Galería o Archivo.',
    }
  }
  if (typeof navigator.clipboard.read !== 'function') {
    return {
      ok: false,
      message: 'Safari no permite leer el portapapeles aquí. Mantenga presionado «Pegar aquí» y elija Pegar, o use Galería/Archivo.',
    }
  }
  try {
    const items = await navigator.clipboard.read()
    for (const item of items || []) {
      const types = item.types || []
      const prefer = [
        ...types.filter((t) => String(t).startsWith('image/')),
        ...types.filter((t) => String(t) === 'application/pdf'),
      ]
      for (const type of prefer) {
        try {
          const blob = await item.getType(type)
          if (!blob || !blob.size) continue
          const ext = type.includes('pdf')
            ? 'pdf'
            : (type.split('/')[1] || 'png').replace('jpeg', 'jpg')
          const file = new File([blob], `pegado.${ext}`, { type: blob.type || type })
          return { ok: true, file }
        } catch {
          /* tipo no legible */
        }
      }
    }
    return {
      ok: false,
      message: 'El portapapeles no tiene una imagen o PDF. Copie de nuevo o use Galería/Archivo.',
    }
  } catch (err) {
    const name = err?.name || ''
    const msg = String(err?.message || '')
    if (name === 'NotAllowedError' || /denied|permission|not allowed/i.test(msg)) {
      return {
        ok: false,
        message: 'No se pudo leer el portapapeles (permiso denegado). Mantenga presionado «Pegar aquí» y elija Pegar, o use Galería/Archivo.',
      }
    }
    return {
      ok: false,
      message: 'No se pudo leer el portapapeles. Use el recuadro «Pegar aquí», Galería o Archivo.',
    }
  }
}

export const MSG_PEGADO_VACIO = (
  'No se pudo pegar ese contenido. Si lo copió desde la app Archivos, '
  + 'el navegador suele no entregarlo: use el botón Archivo o Galería.'
)

export function validateSoportePaste(file, which) {
  if (!file) {
    return { ok: false, message: MSG_PEGADO_VACIO }
  }
  const type = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  const isPdf = type === 'application/pdf' || name.endsWith('.pdf')
  const isImage = type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)$/i.test(name)
  if (which === 'material') {
    if (isPdf) {
      return {
        ok: false,
        message: 'La foto del descargue debe ser una imagen. Use Cámara, Galería o Archivo.',
      }
    }
    if (!isImage) {
      return {
        ok: false,
        message: 'La foto del descargue debe ser una imagen. Use Cámara, Galería o Archivo.',
      }
    }
    return { ok: true }
  }
  if (isPdf || isImage) return { ok: true }
  return {
    ok: false,
    message: 'La remisión debe ser imagen o PDF. Use Archivo o Galería si el pegado no trae el archivo.',
  }
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
