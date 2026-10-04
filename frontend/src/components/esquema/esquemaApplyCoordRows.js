/**
 * Lógica de «Dibujar nodos» según tipo de dibujo del reporte (nodo | linea | poligono)
 * y resolución de nodos para «Unir por número» contra lienzo + tabla de coordenadas.
 */
import { PX_PER_METER } from './esquemaGeometry.js'

function coordOriginFromRows(rows) {
  const first = (rows || []).find((r) => Number.isFinite(r?.norte) && Number.isFinite(r?.este))
  if (!first) return { este0: 0, norte0: 0 }
  return { este0: Number(first.este) || 0, norte0: Number(first.norte) || 0 }
}

/** Este → X; Norte → Y hacia arriba (se invierte el eje Y del lienzo). */
function topoToWorld(este, norte, origin, pxPerMeter = PX_PER_METER) {
  const o = origin || { este0: 0, norte0: 0 }
  return {
    x: ((este ?? 0) - (o.este0 || 0)) * pxPerMeter,
    y: -((norte ?? 0) - (o.norte0 || 0)) * pxPerMeter,
  }
}

/**
 * @param {Array<{norte?:any,este?:any,cota?:any,desc?:any,num?:any}>} rows
 * @returns {{ num: string, norte: number, este: number, cota: number|null, desc: string }[]}
 */
export function parseCoordRowsForCanvas(rows) {
  const list = (rows || []).filter((r) => r && (r.norte !== '' || r.este !== ''))
  return list.map((r, i) => ({
    num: String(i + 1),
    norte: Number(r.norte),
    este: Number(r.este),
    cota: r.cota === '' || r.cota == null ? null : Number(r.cota),
    desc: String(r.desc || ''),
  })).filter((r) => Number.isFinite(r.norte) && Number.isFinite(r.este))
}

/**
 * @param {ReturnType<typeof parseCoordRowsForCanvas>} parsed
 * @param {{ color?: string, uid?: () => string }} opts
 */
export function buildNodosFromParsedCoords(parsed, opts = {}) {
  const origin = coordOriginFromRows(parsed)
  const uid = typeof opts.uid === 'function' ? opts.uid : (() => `n${Math.random().toString(36).slice(2, 9)}`)
  const color = opts.color || '#0f172a'
  const nodes = (parsed || []).map((r) => {
    const pt = topoToWorld(r.este, r.norte, origin)
    return {
      id: uid(),
      type: 'nodo',
      x: pt.x,
      y: pt.y,
      nodeNum: r.num,
      norte: r.norte,
      este: r.este,
      cota: r.cota,
      desc: r.desc,
      color,
    }
  })
  return { origin, nodes }
}

/**
 * Líneas que unen nodos en orden (1→2→…→n).
 * @param {object[]} nodes
 * @param {{ color?: string, width?: number, lineStyle?: string, uid?: () => string }} [opts]
 */
export function buildLineasUniendoNodos(nodes, opts = {}) {
  const list = Array.isArray(nodes) ? nodes.filter((n) => n && n.type === 'nodo') : []
  if (list.length < 2) return []
  const uid = typeof opts.uid === 'function' ? opts.uid : (() => `l${Math.random().toString(36).slice(2, 9)}`)
  const lines = []
  for (let i = 1; i < list.length; i += 1) {
    const a = list[i - 1]
    const b = list[i]
    lines.push({
      id: uid(),
      type: 'linea',
      joinSeq: true,
      fromCoordTable: true,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      color: opts.color || a.color || '#0f172a',
      width: opts.width || 3,
      lineStyle: opts.lineStyle || 'continua',
      rotation: 0,
    })
  }
  return lines
}

/**
 * Busca un nodo en el lienzo por número; si no está, en la tabla de coordenadas.
 * @returns {{ kind: 'canvas', node: object } | { kind: 'table', row: object } | { kind: 'missing', num: string }}
 */
export function resolveNodoPorNumero(num, objects, coordRows) {
  const key = String(num ?? '').trim()
  if (!key) return { kind: 'missing', num: '' }
  const onCanvas = (objects || []).find(
    (o) => o && o.type === 'nodo' && String(o.nodeNum) === key,
  )
  if (onCanvas) return { kind: 'canvas', node: onCanvas }

  const rows = Array.isArray(coordRows) ? coordRows : []
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]
    if (!r) continue
    const displayNum = String(i + 1)
    const own = String(r.num ?? '').trim()
    if (displayNum === key || own === key) {
      return { kind: 'table', row: { ...r, num: displayNum } }
    }
  }
  return { kind: 'missing', num: key }
}

export function mensajeNodoInexistente(num) {
  const n = String(num ?? '').trim()
  if (!n) return 'Indique un número de nodo.'
  return `No existe el nodo «${n}» en la tabla de coordenadas ni en el dibujo.`
}

/**
 * Qué debe hacer el botón «Dibujar nodos» según el tipo de dibujo del reporte.
 * @param {'nodo'|'linea'|'poligono'|string} tipo
 */
export function accionDibujarNodosPorTipo(tipo) {
  const t = String(tipo || 'nodo').toLowerCase()
  if (t === 'linea') return { unirEnOrden: true, abrirUnirPorNumero: false }
  if (t === 'poligono') return { unirEnOrden: false, abrirUnirPorNumero: true }
  return { unirEnOrden: false, abrirUnirPorNumero: false }
}
