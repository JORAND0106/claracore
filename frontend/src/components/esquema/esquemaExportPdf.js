/**
 * PDF del esquema al guardar: páginas con PNG del gráfico, memorias y despieces.
 * Nitidez = PNG embebido sin recompresión JPEG. Tipografía ya aplicada en las PNG.
 */
import { jsPDF } from 'jspdf'

/**
 * @param {string} dataUri
 * @returns {{ bytes: Uint8Array, w: number, h: number, format: 'PNG'|'JPEG' }|null}
 */
function decodeImageDataUri(dataUri) {
  const raw = String(dataUri || '')
  const m = raw.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i)
  if (!m) return null
  const mime = m[1].toLowerCase()
  const b64 = m[2]
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary')
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return {
    bytes,
    format: mime.includes('png') ? 'PNG' : 'JPEG',
    // Dimensiones se leen al añadir; placeholder hasta medir
    w: 0,
    h: 0,
  }
}

/**
 * Mide PNG/JPEG en browser o con proporciones por defecto.
 */
async function measureImage(dataUri) {
  if (typeof Image !== 'undefined' && typeof document !== 'undefined') {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height })
      img.onerror = () => resolve({ w: 1200, h: 1600 })
      img.src = dataUri
    })
  }
  // Node / tests: asume A4 portrait aspect si no hay DOM
  return { w: 1200, h: 1600 }
}

/**
 * @param {{
 *   title?: string,
 *   esquemaPng?: string|null,
 *   adjuntos?: Array<{ dataUri?: string, kind?: string, nombre?: string }>,
 * }} opts
 * @returns {Promise<{ dataUri: string, blob?: Blob, mime: string, kind: string, nombre: string }|null>}
 */
export async function composeEsquemaPdf({
  title = 'Esquema',
  esquemaPng = null,
  adjuntos = [],
} = {}) {
  const pages = []
  if (esquemaPng && String(esquemaPng).startsWith('data:image/')) {
    pages.push({ dataUri: esquemaPng, label: title })
  }
  for (const adj of adjuntos || []) {
    if (!adj?.dataUri || !String(adj.dataUri).startsWith('data:image/')) continue
    const kind = String(adj.kind || '')
    if (kind === 'esquema-pdf' || kind === 'esquema-dxf' || kind === 'esquema-scene') continue
    pages.push({ dataUri: adj.dataUri, label: adj.nombre || kind || 'Adjunto' })
  }
  if (!pages.length) return null

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 12

  for (let i = 0; i < pages.length; i += 1) {
    if (i > 0) doc.addPage()
    const { dataUri, label } = pages[i]
    const decoded = decodeImageDataUri(dataUri)
    if (!decoded) continue
    const dim = await measureImage(dataUri)
    const availW = pageW - margin * 2
    const availH = pageH - margin * 2 - 10
    const scale = Math.min(availW / Math.max(1, dim.w), availH / Math.max(1, dim.h))
    const drawW = dim.w * scale
    const drawH = dim.h * scale
    const x = margin + (availW - drawW) / 2
    const y = margin + 8
    doc.setFontSize(10)
    doc.setTextColor(30)
    doc.text(String(label || title).slice(0, 90), margin, margin + 2)
    try {
      doc.addImage(dataUri, decoded.format, x, y, drawW, drawH, undefined, 'FAST')
    } catch {
      // Fallback: algunos entornos no aceptan data URI directo
      const raw = dataUri.split(',')[1]
      if (raw) doc.addImage(raw, decoded.format, x, y, drawW, drawH, undefined, 'FAST')
    }
  }

  const dataUriOut = doc.output('datauristring')
  const safe = String(title || 'esquema').replace(/[^\w\-áéíóúÁÉÍÓÚñÑ]+/g, '_').slice(0, 60)
  return {
    dataUri: dataUriOut,
    mime: 'application/pdf',
    kind: 'esquema-pdf',
    origen: 'esquema',
    nombre: `${safe || 'esquema'}.pdf`,
  }
}
