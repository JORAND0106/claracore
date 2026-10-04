/**
 * Coordenadas topográficas de la portada del reporte (SicoeObra).
 * Normaliza filas para el API y convierte errores HTTP en mensajes claros.
 */

/** Convierte entrada de formulario a número o null (nunca string vacío). */
export function numeroTopoONull(raw) {
  if (raw === '' || raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const s = String(raw).trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Prepara un punto para POST /puntos-topograficos (solo campos admitidos).
 * @returns {null|{ punto: string|null, norte: number|null, este: number|null, cota: number|null, descripcion: string|null }}
 */
export function normalizarPuntoTopoPortada(p) {
  if (!p || typeof p !== 'object') return null
  const norte = numeroTopoONull(p.norte)
  const este = numeroTopoONull(p.este)
  const cota = numeroTopoONull(p.cota)
  const punto = p.punto == null || String(p.punto).trim() === ''
    ? null
    : String(p.punto).trim()
  const descripcion = p.descripcion == null || String(p.descripcion).trim() === ''
    ? null
    : String(p.descripcion).trim()
  // Debe tener al menos Norte o Este numérico
  if (norte == null && este == null) return null
  return { punto, norte, este, cota, descripcion }
}

/**
 * @param {Array<object>} rows
 * @returns {ReturnType<typeof normalizarPuntoTopoPortada>[]}
 */
export function normalizarPuntosTopoPortada(rows) {
  const out = []
  for (const row of rows || []) {
    const n = normalizarPuntoTopoPortada(row)
    if (n) out.push(n)
  }
  return out
}

const CAMPO_LABEL = {
  norte: 'Norte',
  este: 'Este',
  cota: 'Cota',
  punto: 'Punto',
  descripcion: 'Descripción',
  puntos: 'coordenadas',
}

function traducirMsgValidacion(msg) {
  const s = String(msg || '')
  const low = s.toLowerCase()
  if (low.includes('valid number') || low.includes('type_error.float') || low.includes('parse string as a number')) {
    return 'debe ser un número válido'
  }
  if (low.includes('field required') || low.includes('missing')) {
    return 'es obligatorio'
  }
  if (low.includes('not a valid integer')) return 'debe ser un número entero'
  return s
}

function formatearItemDetail(item) {
  if (item == null) return ''
  if (typeof item === 'string') return item.trim()
  if (typeof item !== 'object') return String(item)
  if (typeof item.detail === 'string') return item.detail
  const msg = traducirMsgValidacion(item.msg || item.message || '')
  const loc = Array.isArray(item.loc) ? item.loc : []
  const campos = loc
    .filter((x) => x !== 'body' && typeof x === 'string')
    .map((x) => CAMPO_LABEL[x] || x)
  const idxs = loc.filter((x) => typeof x === 'number')
  const fila = idxs.length ? `fila ${idxs[0] + 1}` : ''
  const campo = campos[campos.length - 1] || campos[0] || ''
  const pref = [fila, campo].filter(Boolean).join(', ')
  if (pref && msg) return `${pref}: ${msg}`
  if (msg) return msg
  if (pref) return `Dato inválido en ${pref}`
  return ''
}

/**
 * Convierte `detail` de FastAPI / cuerpo de error en texto legible (nunca "[object Object]").
 */
export function mensajeDesdeDetailApi(detail, fallback = 'No se pudo completar la operación.') {
  if (detail == null || detail === '') return fallback
  if (typeof detail === 'string') {
    const t = detail.trim()
    return t && t !== '[object Object]' ? t : fallback
  }
  if (Array.isArray(detail)) {
    const parts = detail.map(formatearItemDetail).map((s) => s.trim()).filter(Boolean)
    return parts.length ? parts.join('. ') : fallback
  }
  if (typeof detail === 'object') {
    if (typeof detail.detail === 'string' && detail.detail.trim()) return detail.detail.trim()
    if (typeof detail.message === 'string' && detail.message.trim()) return detail.message.trim()
    if (typeof detail.msg === 'string' && detail.msg.trim()) return detail.msg.trim()
    const nested = formatearItemDetail(detail)
    if (nested) return nested
  }
  return fallback
}

/**
 * Lee el cuerpo de una Response fallida y devuelve mensaje en español.
 */
export async function mensajeErrorRespuestaTopo(res, fallback) {
  const fb = fallback || `No se pudo guardar la topografía (error ${res?.status || ''}).`.trim()
  if (!res) return fb
  try {
    const text = await res.text()
    if (!text) return fb
    try {
      const j = JSON.parse(text)
      return mensajeDesdeDetailApi(j?.detail ?? j, fb)
    } catch {
      const t = text.trim()
      return t && t !== '[object Object]' ? t : fb
    }
  } catch {
    return fb
  }
}

/**
 * Mensaje final para alertas de guardado de topografía en portada.
 */
export function mensajeErrorGuardarTopografiaPortada(err, fallback) {
  const fb = fallback || 'No se pudo guardar la topografía.'
  if (err == null) return fb
  if (typeof err === 'string') {
    const t = err.trim()
    return t && t !== '[object Object]' ? t : fb
  }
  const msg = err?.message
  if (typeof msg === 'string' && msg.trim() && msg.trim() !== '[object Object]') {
    return msg.trim()
  }
  if (err?.detail != null) return mensajeDesdeDetailApi(err.detail, fb)
  return fb
}
