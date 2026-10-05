/** Posicionamiento del panel del CalPicker (puro, testeable). */

export const SUB_CAL_PANEL_MIN_W = 260
export const SUB_CAL_PANEL_EST_H = 320
export const SUB_CAL_Z_ABOVE_MODAL = 10050

/**
 * Posición fixed del panel relativa al ancla; voltea hacia arriba si no hay espacio.
 */
export function computeCalPickerPosition(anchorRect, {
  panelW = SUB_CAL_PANEL_MIN_W,
  panelH = SUB_CAL_PANEL_EST_H,
  gap = 4,
  margin = 8,
  vw = typeof window !== 'undefined' ? window.innerWidth : 1024,
  vh = typeof window !== 'undefined' ? window.innerHeight : 768,
} = {}) {
  if (!anchorRect) return { top: margin, left: margin, width: panelW }
  let top = anchorRect.bottom + gap
  let left = anchorRect.left
  const width = Math.min(panelW, Math.max(200, vw - margin * 2))

  if (top + panelH > vh - margin && anchorRect.top > panelH + gap + margin) {
    top = anchorRect.top - panelH - gap
  }
  if (left + width > vw - margin) left = Math.max(margin, vw - width - margin)
  if (left < margin) left = margin
  if (top + panelH > vh - margin) top = Math.max(margin, vh - panelH - margin)
  if (top < margin) top = margin

  return { top, left, width }
}
