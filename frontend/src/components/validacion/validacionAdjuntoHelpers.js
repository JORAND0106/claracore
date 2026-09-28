/**
 * Extrae imagen del evento paste (portapapeles).
 * Reutilizado por popups de validación (Topo / SICOE).
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
 * Lee una imagen del portapapeles vía Clipboard API.
 * @returns {Promise<File|null>}
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

/**
 * @param {File} file
 * @returns {Promise<string>} data URL
 */
export function fileToDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Sube un adjunto de validación al backend.
 * @returns {Promise<{ url: string, nombre: string, mime: string }>}
 */
export async function subirAdjuntoValidacion({ apiBase, token, contratoId, file }) {
  if (!file || !contratoId) throw new Error('Archivo o contrato no válido')
  const fd = new FormData()
  fd.append('file', file, file.name || `imagen-${Date.now()}.png`)
  const res = await fetch(`${apiBase}/validacion-adjuntos/${contratoId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
  if (!res.ok) {
    let msg = `Error ${res.status} al subir imagen`
    try {
      const j = await res.json()
      msg = j?.detail || msg
      if (typeof msg !== 'string') msg = JSON.stringify(msg)
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  const data = await res.json()
  return {
    url: data.url,
    nombre: data.nombre || file.name || 'imagen',
    mime: data.mime || file.type || 'image/jpeg',
  }
}

/**
 * Sube todos los pendientes locales (con File) y devuelve lista {url,nombre,mime}.
 * @param {{ apiBase: string, token: string, contratoId: number|string, locales: Array<{ file?: File, url?: string, nombre?: string, mime?: string, previewUrl?: string }> }} opts
 */
export async function subirAdjuntosValidacionPendientes({ apiBase, token, contratoId, locales }) {
  const list = Array.isArray(locales) ? locales : []
  const out = []
  for (const item of list) {
    if (item?.url && !item?.file) {
      out.push({
        url: item.url,
        nombre: item.nombre || 'imagen',
        mime: item.mime || 'image/jpeg',
      })
      continue
    }
    if (!item?.file) continue
    const up = await subirAdjuntoValidacion({
      apiBase,
      token,
      contratoId,
      file: item.file,
    })
    out.push(up)
  }
  return out
}

/** Heurística: URL de imagen por extensión o mime. */
export function urlPareceImagen(url, mime) {
  if (mime && String(mime).startsWith('image/')) return true
  const u = String(url || '').split('?')[0].toLowerCase()
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(u)
}
