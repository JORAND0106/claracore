import { PX_PER_METER } from './esquemaGeometry.js'

export const IA_MAX_USOS = 20
export const IA_LOCAL_KEY = 'cc_esquema_ia_uso_diario'

const SHAPE = new Set(['linea', 'flecha', 'rect', 'elipse', 'triangulo'])
const PATH = new Set(['polilinea', 'stroke'])

function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function uid() {
  return `ia${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function iaFechaBogota(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function iaRemainingHoy(usos) {
  return Math.max(0, IA_MAX_USOS - Math.max(0, Number(usos) || 0))
}

export function iaBlocked(usos) {
  return (Number(usos) || 0) >= IA_MAX_USOS
}

export function iaHasScene(objects) {
  return sceneForIa(objects).length > 0
}

export function sceneForIa(objects) {
  const out = []
  for (const o of objects || []) {
    if (!o || o.type === 'image' || o.type === 'bloque') continue
    if (o.type === 'hatchRegion') {
      out.push({
        type: 'hatchRegion',
        x: num(o.x),
        y: num(o.y),
        w: num(o.w),
        h: num(o.h),
        hatch: num(o.hatch),
      })
      continue
    }
    out.push(o)
  }
  return out.slice(0, 80)
}

export function hydrateIaObjects(raw) {
  const out = []
  for (const item of raw || []) {
    if (!item || typeof item !== 'object') continue
    const t = String(item.type || '')
    if (SHAPE.has(t)) {
      out.push({
        id: uid(),
        type: t,
        x1: num(item.x1),
        y1: num(item.y1),
        x2: num(item.x2, PX_PER_METER),
        y2: num(item.y2, PX_PER_METER),
        color: item.color || '#1e293b',
        width: Math.max(0.5, num(item.width, 2)),
        rotation: 0,
        hatch: null,
      })
    } else if (PATH.has(t) && Array.isArray(item.points) && item.points.length >= 2) {
      out.push({
        id: uid(),
        type: t === 'stroke' ? 'stroke' : 'polilinea',
        points: item.points.map((p) => ({ x: num(p.x), y: num(p.y) })),
        color: item.color || '#1e293b',
        width: Math.max(0.5, num(item.width, 2)),
      })
    } else if (t === 'nodo') {
      out.push({
        id: uid(),
        type: 'nodo',
        x: num(item.x),
        y: num(item.y),
        nodeNum: String(item.nodeNum || out.length + 1),
        desc: String(item.desc || ''),
        color: item.color || '#1e293b',
      })
    } else if (t === 'texto' && String(item.text || '').trim()) {
      out.push({
        id: uid(),
        type: 'texto',
        x: num(item.x),
        y: num(item.y),
        w: Math.max(40, num(item.w, 160)),
        h: Math.max(24, num(item.h, 40)),
        text: String(item.text),
        color: item.color || '#0f172a',
        fontSize: Math.max(10, Math.min(28, num(item.fontSize, 14))),
        rotation: 0,
      })
    }
  }
  return out
}

export function readLocalIaUsos(fecha = iaFechaBogota()) {
  try {
    const raw = JSON.parse(localStorage.getItem(IA_LOCAL_KEY) || 'null')
    if (!raw || String(raw.fecha) !== String(fecha)) return 0
    const n = Number(raw.usos)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

export function writeLocalIaUsos(usos, fecha = iaFechaBogota()) {
  try {
    localStorage.setItem(IA_LOCAL_KEY, JSON.stringify({
      fecha,
      usos: Math.max(0, Number(usos) || 0),
    }))
  } catch { /* ignore */ }
}
