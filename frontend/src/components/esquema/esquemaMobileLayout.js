/**
 * Layout celular de la herramienta de esquema.
 * iPad / portátil conservan ventana cuadrada + panel lateral izquierdo.
 */
import { CLARA_BP } from '../../useClaraViewport.js'

/** Teléfono (incluido landscape): no tablet ni desktop. */
export function isEsquemaPhoneViewport(vp) {
  if (!vp) return false
  if (vp.isLandscapeMobile) return true
  if (vp.isMobile) return true
  // Fallback por ancho (SSR / tests)
  const w = Number(vp.width)
  if (Number.isFinite(w) && w > 0 && w <= CLARA_BP.mobileMax) return true
  return false
}

/** Alturas de la hoja inferior (fracción de la ventana / px mínimos). */
export const ESQUEMA_PHONE_SHEET_SNAPS = {
  collapsed: { id: 'collapsed', frac: 0.08, minPx: 44, label: 'Contraída' },
  medium: { id: 'medium', frac: 0.42, minPx: 180, label: 'Media' },
  full: { id: 'full', frac: 0.88, minPx: 280, label: 'Completa' },
}

export const ESQUEMA_PHONE_SHEET_ORDER = ['collapsed', 'medium', 'full']

export function phoneSheetHeightPx(snapId, viewportH) {
  const snap = ESQUEMA_PHONE_SHEET_SNAPS[snapId] || ESQUEMA_PHONE_SHEET_SNAPS.collapsed
  const h = Number(viewportH)
  const vh = Number.isFinite(h) && h > 0 ? h : 640
  return Math.max(snap.minPx, Math.round(vh * snap.frac))
}

export function nearestPhoneSheetSnap(heightPx, viewportH) {
  const h = Number(heightPx)
  if (!Number.isFinite(h)) return 'collapsed'
  let best = 'collapsed'
  let bestDist = Infinity
  for (const id of ESQUEMA_PHONE_SHEET_ORDER) {
    const target = phoneSheetHeightPx(id, viewportH)
    const d = Math.abs(target - h)
    if (d < bestDist) {
      bestDist = d
      best = id
    }
  }
  return best
}

/**
 * Dimensiones de ventana a pantalla completa en celular.
 * El lienzo usa el resto tras barra (+ hoja si aplica).
 */
export function phoneModalOuterSize(viewportW, viewportH) {
  const w = Math.max(280, Math.floor(Number(viewportW) || 360))
  const h = Math.max(280, Math.floor(Number(viewportH) || 640))
  return { w, h, side: Math.min(w, h), sidebar: 0, phone: true }
}

/** Categorías de la barra compacta (ícono + etiqueta). */
export const ESQUEMA_PHONE_TOOL_CATEGORIES = [
  { id: 'dibujo', label: 'Dibujo' },
  { id: 'edicion', label: 'Edición' },
  { id: 'vistas3d', label: 'Vistas y 3D' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'calculo', label: 'Cálculo y despiece' },
]

/**
 * Mapea grupos históricos TOOL_GROUPS + extras a categorías de celular.
 * @param {{ id: string, tools: Array }} groups
 */
export function phoneCategoryToolIds(groups = []) {
  const byId = Object.fromEntries((groups || []).map((g) => [g.id, (g.tools || []).map((t) => t.id)]))
  return {
    dibujo: [...(byId.dibujo || []), ...(byId.anotacion || [])],
    edicion: [...(byId.edicion || [])],
    vistas3d: [...(byId.vista || []).filter((id) => id === 'seleccion' || id === 'paneo'), 'modo-3d'],
    zoom: ['zoom-extendido', 'zoom-ventana', 'zoom-out', 'zoom-in', 'zoom-100'],
    calculo: ['calc-volumenes', 'despiece'],
  }
}
