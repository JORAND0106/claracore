/**
 * Tipos de dibujo del reporte: nodo | linea | poligono.
 * Sugerencia, validación y mensajes según el tipo elegido.
 */

export const DIBUJO_TIPOS = Object.freeze(['nodo', 'linea', 'poligono'])

export function normalizarTipoDibujo(raw, { fallback = 'poligono' } = {}) {
  const t = String(raw || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (t === 'nodo' || t === 'punto' || t === 'point' || t === 'node') return 'nodo'
  if (t === 'linea' || t === 'line' || t === 'franja') return 'linea'
  if (t === 'poligono' || t === 'polygon' || t === 'area' || t === 'área') return 'poligono'
  return fallback
}

/** Sugiere tipo según cantidad de coordenadas de la portada. */
export function sugerirTipoDibujo(nCoords) {
  const n = Number(nCoords) || 0
  if (n <= 1) return 'nodo'
  if (n === 2) return 'linea'
  return 'poligono'
}

export function tipoDesdeEscenaGuardada(escena, dibujoGeojson) {
  const fromEscena = normalizarTipoDibujo(escena?.dibujo_tipo, { fallback: '' })
  if (fromEscena) return fromEscena
  const feats = dibujoGeojson?.features || (dibujoGeojson?.type === 'Feature' ? [dibujoGeojson] : [])
  for (const f of feats) {
    const p = f?.properties || {}
    const t = normalizarTipoDibujo(p.dibujo_tipo || p.huella_tipo, { fallback: '' })
    if (t) return t
    const gt = f?.geometry?.type
    if (gt === 'Point') return 'nodo'
    if (gt === 'LineString' || gt === 'MultiLineString') return 'linea'
  }
  // Dibujos previos sin tipo → polígono
  return 'poligono'
}

function puntosDeObjeto(obj) {
  if (!obj || typeof obj !== 'object') return []
  const type = String(obj.type || '')
  if (type === 'nodo') {
    if (Number.isFinite(obj.x) && Number.isFinite(obj.y)) return [{ x: obj.x, y: obj.y, num: obj.nodeNum }]
    return []
  }
  if (type === 'polilinea' || type === 'stroke') {
    return (Array.isArray(obj.points) ? obj.points : [])
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => ({ x: p.x, y: p.y }))
  }
  if (type === 'linea' || type === 'flecha') {
    const pts = []
    if (Number.isFinite(obj.x1) && Number.isFinite(obj.y1)) pts.push({ x: obj.x1, y: obj.y1 })
    if (Number.isFinite(obj.x2) && Number.isFinite(obj.y2)) pts.push({ x: obj.x2, y: obj.y2 })
    return pts
  }
  if (type === 'rect') {
    const { x1, y1, x2, y2 } = obj
    if (![x1, y1, x2, y2].every(Number.isFinite)) return []
    return [
      { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 },
    ]
  }
  if (type === 'triangulo') {
    return (Array.isArray(obj.points) ? obj.points : [])
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .slice(0, 3)
  }
  return []
}

export function contarPuntosEscena(objects) {
  const list = Array.isArray(objects) ? objects : []
  let max = 0
  let nodos = 0
  for (const o of list) {
    if (o?.type === 'nodo') nodos += 1
    const n = puntosDeObjeto(o).length
    if (n > max) max = n
  }
  return Math.max(max, nodos)
}

/**
 * @returns {{ ok: boolean, mensaje: string, puntos: number }}
 */
export function validarEscenaPorTipo(objects, tipoRaw) {
  const tipo = normalizarTipoDibujo(tipoRaw)
  const list = Array.isArray(objects) ? objects : []
  const nNodos = list.filter((o) => o?.type === 'nodo').length
  const nPts = contarPuntosEscena(list)

  if (tipo === 'nodo') {
    if (nNodos >= 1 || nPts >= 1) return { ok: true, mensaje: '', puntos: Math.max(nNodos, nPts) }
    return {
      ok: false,
      mensaje: 'Para guardar un nodo se requiere al menos un punto.',
      puntos: 0,
    }
  }
  if (tipo === 'linea') {
    const tieneLinea = list.some((o) => {
      const t = o?.type
      if (t === 'linea' || t === 'flecha') return true
      if (t === 'polilinea' || t === 'stroke') return (o.points || []).length >= 2
      return false
    })
    if (tieneLinea || nNodos >= 2 || nPts >= 2) {
      return { ok: true, mensaje: '', puntos: Math.max(nPts, nNodos) }
    }
    return {
      ok: false,
      mensaje: 'Para guardar una línea se requieren al menos dos puntos.',
      puntos: nPts,
    }
  }
  // poligono
  const tieneCerrada = list.some((o) => {
    const t = o?.type
    if (t === 'rect' || t === 'triangulo' || t === 'hatch') return true
    if (t === 'polilinea' || t === 'stroke') {
      const pts = o.points || []
      if (pts.length < 3) return false
      if (o.closed === true) return true
      const a = pts[0]
      const b = pts[pts.length - 1]
      return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6
    }
    return false
  })
  if (tieneCerrada && nPts >= 3) return { ok: true, mensaje: '', puntos: nPts }
  if (nPts >= 3 && !tieneCerrada) {
    return {
      ok: false,
      mensaje: 'Para guardar un polígono cierre el área (polilínea cerrada, rectángulo o triángulo).',
      puntos: nPts,
    }
  }
  return {
    ok: false,
    mensaje: 'Para guardar un polígono se requieren al menos tres puntos que formen un área cerrada.',
    puntos: nPts,
  }
}

export function mensajeValidacionTipo(tipoRaw, objects) {
  return validarEscenaPorTipo(objects, tipoRaw).mensaje
}
