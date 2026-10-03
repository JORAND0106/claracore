/**
 * Geometría de bloques de nodo (medidas reales en metros) → mundo esquema / GeoJSON.
 */
import { metersToWorld, PX_PER_METER } from '../../components/esquema/esquemaGeometry.js'
import { worldPointToLngLat } from './sicoeDibujoEscenaGeojson.js'

export const BLOQUE_FORMAS = Object.freeze([
  { id: 'circulo', label: 'Círculo' },
  { id: 'cuadrado', label: 'Cuadrado' },
  { id: 'rectangulo', label: 'Rectángulo' },
  { id: 'ovalo', label: 'Óvalo' },
  { id: 'personalizado', label: 'Personalizado' },
])

export function normalizarFormaBloque(raw) {
  const t = String(raw || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (['circle', 'circunferencia', 'pozo', 'circulo'].includes(t)) return 'circulo'
  if (['square', 'cuadro', 'cuadrado'].includes(t)) return 'cuadrado'
  if (['rectangle', 'rect', 'rectangulo'].includes(t)) return 'rectangulo'
  if (['ellipse', 'elipse', 'oval', 'ovalo'].includes(t)) return 'ovalo'
  if (['custom', 'path', 'poligono', 'personalizado'].includes(t)) return 'personalizado'
  return 'circulo'
}

function medida(v, d = 1) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : d
}

/** Vértices locales en metros (+X este, +Y norte), centro 0,0. */
export function verticesLocalesBloque(bloque, { nCirculo = 24 } = {}) {
  const forma = normalizarFormaBloque(bloque?.forma)
  const w = medida(bloque?.ancho_m, 1)
  const h = medida(bloque?.alto_m, w)
  if (forma === 'personalizado' && Array.isArray(bloque?.vertices) && bloque.vertices.length >= 3) {
    return bloque.vertices
      .map((p) => [Number(p[0]), Number(p[1])])
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
  }
  if (forma === 'circulo') {
    const r = w / 2
    return Array.from({ length: nCirculo }, (_, i) => {
      const a = (2 * Math.PI * i) / nCirculo
      return [r * Math.cos(a), r * Math.sin(a)]
    })
  }
  if (forma === 'ovalo') {
    const rx = w / 2
    const ry = h / 2
    return Array.from({ length: nCirculo }, (_, i) => {
      const a = (2 * Math.PI * i) / nCirculo
      return [rx * Math.cos(a), ry * Math.sin(a)]
    })
  }
  const hw = w / 2
  const hh = h / 2
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
}

function rotarLocal(x, y, deg) {
  const rad = (Number(deg) || 0) * Math.PI / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [x * c - y * s, x * s + y * c]
}

/**
 * Contorno del bloque en coords mundo del lienzo (Y↓).
 * Local +Y norte → mundo -Y.
 */
export function bloqueAContornoMundo(cx, cy, bloque, rotacionDeg = 0) {
  const verts = verticesLocalesBloque(bloque)
  return verts.map(([x, y]) => {
    const [xr, yr] = rotarLocal(x, y, rotacionDeg)
    return {
      x: cx + metersToWorld(xr),
      y: cy - metersToWorld(yr),
    }
  })
}

export function bloqueAPoligonoGeojson(lng, lat, bloque, rotacionDeg, origin) {
  // Preferir proyección local vía mundo si hay origin; si no, desde lng/lat directo
  if (origin && Number.isFinite(origin.lng) && Number.isFinite(origin.lat)) {
    // Convertir lng/lat a mundo aproximado respecto origin — o dibujar ring en lng/lat
  }
  const verts = verticesLocalesBloque(bloque)
  if (verts.length < 3 || !Number.isFinite(lng) || !Number.isFinite(lat)) return null
  const METERS_PER_DEG_LAT = 111320
  const cos = Math.cos((lat * Math.PI) / 180)
  const ring = verts.map(([x, y]) => {
    const [xr, yr] = rotarLocal(x, y, rotacionDeg)
    const dLat = yr / METERS_PER_DEG_LAT
    const dLng = cos > 1e-6 ? xr / (METERS_PER_DEG_LAT * cos) : 0
    return [lng + dLng, lat + dLat]
  })
  const a = ring[0]
  const b = ring[ring.length - 1]
  if (a[0] !== b[0] || a[1] !== b[1]) ring.push([...a])
  return { type: 'Polygon', coordinates: [ring] }
}

/** Dibuja contorno de bloque en canvas 2d (coords mundo ya transformadas por caller). */
export function strokeBloqueEnCtx(ctx, cx, cy, bloque, rotacionDeg, { fill, stroke, lineWidth } = {}) {
  const pts = bloqueAContornoMundo(cx, cy, bloque, rotacionDeg)
  if (pts.length < 3) return
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth || 1
    ctx.stroke()
  }
}

export function snapshotBloque(b) {
  if (!b) return null
  return {
    id: b.id ?? null,
    nombre: b.nombre || '',
    forma: normalizarFormaBloque(b.forma),
    ancho_m: medida(b.ancho_m, 1),
    alto_m: medida(b.alto_m, medida(b.ancho_m, 1)),
    vertices: Array.isArray(b.vertices) ? b.vertices : null,
  }
}

export { PX_PER_METER, worldPointToLngLat }
