/**
 * Tamaño ajustable de la ventana del esquema (iPad/portátil) — C-2D-08 / C-TX-12.
 * Celular no usa este módulo (pantalla completa).
 */
import { ESQUEMA_CONTEXT_SIDEBAR_W, squareModalOuterSize } from './esquemaGeometry.js'

export const ESQUEMA_MODAL_SIZE_KEY = 'cc_esquema_modal_outer_size_v1'

/** Lado mínimo del área de dibujo (barra + panel siguen usables). */
export const ESQUEMA_MODAL_MIN_DRAW = 280
/** Alto mínimo externo: toolbar (~72) + dibujo mínimo. */
export const ESQUEMA_MODAL_MIN_H = 360
/** Tope del panel lateral al calcular mínimos. */
export const ESQUEMA_MODAL_SIDEBAR_MAX = 560

/**
 * Presupuesto de viewport: casi pantalla, con margen del overlay.
 * @param {number} vpW
 * @param {number} vpH
 */
export function esquemaModalViewportBudget(vpW, vpH) {
  const w = Number(vpW)
  const h = Number(vpH)
  const vw = Number.isFinite(w) && w > 0 ? w : 1280
  const vh = Number.isFinite(h) && h > 0 ? h : 800
  return {
    maxW: Math.max(ESQUEMA_MODAL_MIN_DRAW, Math.floor(Math.min(vw - 16, vw * 0.98 - 16))),
    maxH: Math.max(ESQUEMA_MODAL_MIN_H, Math.floor(Math.min(vh - 16, vh * 0.96 - 16))),
  }
}

/**
 * @param {number} sidebarW
 */
export function esquemaModalMinOuter(sidebarW = 0) {
  const sb = Math.max(0, Number(sidebarW) || 0)
  return {
    minW: ESQUEMA_MODAL_MIN_DRAW + sb,
    minH: ESQUEMA_MODAL_MIN_H,
  }
}

/**
 * Acota w/h al viewport y a los mínimos (barra + lateral usables).
 * @returns {{ w: number, h: number, side: number, sidebar: number }}
 */
export function clampEsquemaModalOuterSize(
  { w, h } = {},
  { maxW, maxH, sidebarW = 0 } = {},
) {
  const sbRaw = Number(sidebarW)
  const sidebar = Number.isFinite(sbRaw) && sbRaw > 0 ? Math.floor(sbRaw) : 0
  const { minW, minH } = esquemaModalMinOuter(sidebar)
  const budget = {
    maxW: Number.isFinite(maxW) && maxW > 0 ? maxW : minW,
    maxH: Number.isFinite(maxH) && maxH > 0 ? maxH : minH,
  }
  const cw = Math.round(Math.min(
    Math.max(budget.maxW, minW),
    Math.max(minW, Number(w) || minW),
  ))
  const ch = Math.round(Math.min(
    Math.max(budget.maxH, minH),
    Math.max(minH, Number(h) || minH),
  ))
  // «side» = espacio de dibujo aproximado (compat con data-modal-side / efectos).
  const side = Math.max(ESQUEMA_MODAL_MIN_DRAW, Math.min(cw - sidebar, ch))
  return { w: cw, h: ch, side, sidebar }
}

/**
 * Aplica un arrastre de borde/esquina. Modal centrado: cambia solo dimensiones.
 * @param {'n'|'s'|'e'|'w'|'ne'|'nw'|'se'|'sw'} edge
 */
export function applyEsquemaModalResizeDelta({
  w0, h0, edge, dx = 0, dy = 0, maxW, maxH, sidebarW = 0,
} = {}) {
  let w = Number(w0) || 0
  let h = Number(h0) || 0
  const ddx = Number(dx) || 0
  const ddy = Number(dy) || 0
  const e = String(edge || '')
  if (e.includes('e')) w += ddx
  if (e.includes('w')) w -= ddx
  if (e.includes('s')) h += ddy
  if (e.includes('n')) h -= ddy
  return clampEsquemaModalOuterSize({ w, h }, { maxW, maxH, sidebarW })
}

/** Tamaño por defecto (cuadrado histórico) acotado al viewport. */
export function defaultEsquemaModalOuterSize(vpW, vpH, sidebarW = ESQUEMA_CONTEXT_SIDEBAR_W) {
  const { maxW, maxH } = esquemaModalViewportBudget(vpW, vpH)
  const sq = squareModalOuterSize(maxW, maxH, sidebarW)
  return clampEsquemaModalOuterSize(
    { w: sq.w, h: sq.h },
    { maxW, maxH, sidebarW },
  )
}

export function readEsquemaModalSizePref(storage = null) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return null
  try {
    const raw = store.getItem(ESQUEMA_MODAL_SIZE_KEY)
    if (!raw) return null
    const j = JSON.parse(raw)
    const w = Number(j?.w)
    const h = Number(j?.h)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 100 || h < 100) return null
    return { w, h }
  } catch {
    return null
  }
}

export function writeEsquemaModalSizePref({ w, h }, storage = null) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  const ww = Number(w)
  const hh = Number(h)
  if (!Number.isFinite(ww) || !Number.isFinite(hh)) return false
  try {
    store.setItem(ESQUEMA_MODAL_SIZE_KEY, JSON.stringify({
      w: Math.round(ww),
      h: Math.round(hh),
    }))
    return true
  } catch {
    return false
  }
}

/**
 * Preferencia + sidebar → layout listo para el modal.
 * Si no hay preferencia, usa el tamaño cuadrado por defecto.
 */
export function resolveEsquemaModalLayout({
  vpW,
  vpH,
  sidebarW = ESQUEMA_CONTEXT_SIDEBAR_W,
  preferred = null,
  storage = null,
} = {}) {
  const { maxW, maxH } = esquemaModalViewportBudget(vpW, vpH)
  const pref = preferred || readEsquemaModalSizePref(storage)
  if (!pref) {
    return defaultEsquemaModalOuterSize(vpW, vpH, sidebarW)
  }
  const { minW } = esquemaModalMinOuter(sidebarW)
  return clampEsquemaModalOuterSize(
    { w: Math.max(pref.w, minW), h: pref.h },
    { maxW, maxH, sidebarW },
  )
}

export const ESQUEMA_MODAL_RESIZE_EDGES = Object.freeze([
  'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw',
])

/** Cursor CSS por borde. */
export function esquemaModalResizeCursor(edge) {
  switch (String(edge || '')) {
    case 'n':
    case 's':
      return 'ns-resize'
    case 'e':
    case 'w':
      return 'ew-resize'
    case 'ne':
    case 'sw':
      return 'nesw-resize'
    case 'nw':
    case 'se':
      return 'nwse-resize'
    default:
      return 'default'
  }
}
