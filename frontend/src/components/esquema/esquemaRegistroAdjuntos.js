/**
 * Regla fija (C-OUT-01 / C-OUT-13): donde se invoca la herramienta, el
 * esquema en el registro/documento es SIEMPRE PNG. PDF, DXF y escena JSON
 * no se adjuntan al registro; van a la carpeta de la nube y/o descarga.
 */

export const ESQUEMA_REGISTRO_BLOCKED_KINDS = Object.freeze([
  'esquema-pdf',
  'esquema-dxf',
  'esquema-scene',
])

export const ESQUEMA_REGISTRO_ALLOWED_KINDS = Object.freeze([
  'esquema',
  'memoria-calculo',
  'despiece-acero',
  'grafico-isometrico',
  'esquema-calculo',
])

/** MIME/extensiones que nunca deben quedar como adjunto del registro. */
export function isEsquemaExportOnlyMime(mime, nombre = '') {
  const m = String(mime || '').toLowerCase()
  const n = String(nombre || '').toLowerCase()
  if (m.includes('dxf') || n.endsWith('.dxf')) return true
  if (m.includes('pdf') && (n.includes('esquema') || n.endsWith('.pdf'))) {
    // Memorias legacy en PDF siguen siendo adjunto de cálculo; el PDF del
    // paquete de esquema (kind esquema-pdf) se filtra por kind.
    return false
  }
  if (m.includes('json') && (n.includes('.scene') || n.endsWith('.json'))) return true
  return false
}

/**
 * ¿Este adjunto puede ir al registro/galería del módulo?
 * Solo PNG de esquema / memoria / despiece (y kind vacío con mime image).
 */
export function isEsquemaRegistroAdjunto(adj) {
  if (!adj) return false
  const kind = String(adj.kind || '').toLowerCase()
  if (ESQUEMA_REGISTRO_BLOCKED_KINDS.includes(kind)) return false
  if (isEsquemaExportOnlyMime(adj.mime || adj.mime_type, adj.nombre || adj.name)) {
    // DXF siempre fuera; scene json fuera
    const m = String(adj.mime || adj.mime_type || '').toLowerCase()
    const n = String(adj.nombre || adj.name || '').toLowerCase()
    if (m.includes('dxf') || n.endsWith('.dxf')) return false
    if (m.includes('json') || n.includes('.scene')) return false
  }
  const mime = String(adj.mime || adj.mime_type || '').toLowerCase()
  const dataUri = String(adj.dataUri || adj.data_uri || '')
  // DXF u otros binarios nunca, aunque el kind diga «esquema».
  if (mime.includes('dxf') || mime.includes('json')) return false
  if (dataUri.startsWith('data:application/dxf') || dataUri.startsWith('data:application/json')) return false
  if (kind && ESQUEMA_REGISTRO_ALLOWED_KINDS.includes(kind)) {
    // Imagen PNG/JPEG, o PDF legacy de memoria de cálculo (no esquema-pdf).
    if (mime.startsWith('image/') || dataUri.startsWith('data:image/')) return true
    if (kind === 'memoria-calculo' && (mime.includes('pdf') || dataUri.startsWith('data:application/pdf'))) {
      return true
    }
    if (!mime && dataUri.startsWith('data:image/')) return true
    if (!mime && !dataUri) return true // meta-only
    return mime.startsWith('image/') || dataUri.startsWith('data:image/')
  }
  if (mime.startsWith('image/')) return true
  if (dataUri.startsWith('data:image/')) return true
  return false
}

/** Filtra extras.adjuntos a lo permitido en el registro. */
export function filterEsquemaRegistroAdjuntos(adjuntos) {
  return (Array.isArray(adjuntos) ? adjuntos : []).filter(isEsquemaRegistroAdjunto)
}

/**
 * ¿Una entrada de galería/historial es un DXF (o export) mal guardado en el registro?
 */
export function isMisplacedEsquemaExportInRegistro(item) {
  if (!item || typeof item !== 'object') return false
  const kind = String(item.kind || '').toLowerCase()
  if (kind === 'esquema-dxf' || kind === 'esquema-pdf' || kind === 'esquema-scene') return true
  const mime = String(item.mime || item.mime_type || '').toLowerCase()
  const nombre = String(item.nombre || item.name || item.url || item.blob_path || '').toLowerCase()
  if (mime.includes('dxf') || nombre.endsWith('.dxf') || nombre.includes('.dxf?')) return true
  if (kind === 'esquema' || String(item.origen || '') === 'esquema') {
    // Esquema principal no puede ser DXF
    if (mime.includes('dxf') || nombre.endsWith('.dxf')) return true
  }
  return false
}

/**
 * Corrige lista de imágenes/gráficos: quita DXF/PDF-paquete/escena del registro
 * y conserva PNG (y memorias/despieces). Si el ítem principal era DXF pero hay
 * un PNG hermano, el PNG queda visible.
 */
export function repairEsquemaRegistroList(list) {
  const arr = Array.isArray(list) ? list : []
  return arr.filter((it) => !isMisplacedEsquemaExportInRegistro(it))
}

/** Data URI / URL es PNG de esquema válido. */
export function isEsquemaPngPayload(dataUriOrUrl, mime = '') {
  const s = String(dataUriOrUrl || '')
  const m = String(mime || '').toLowerCase()
  if (m.includes('png') || m.startsWith('image/png')) return true
  if (s.startsWith('data:image/png')) return true
  if (/\.png(\?|$)/i.test(s)) return true
  return false
}
